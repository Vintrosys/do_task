/**
 * task_dashboard.js
 * Implementation with Pagination (10 per page) and Smooth Transitions
 */

frappe.provide("frappe.ui.pages");

frappe.pages["task_dashboard"].on_page_load = function (wrapper) {
	wrapper._task_dashboard = new TaskDashboard(wrapper);
};

class TaskDashboard {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Task Dashboard"),
			single_column: true,
		});

		this.page_start = 0;
		this.page_length = 10;
		this.total_tasks = 0;
		this.filters = { status: "", priority: "", project: "", assigned_to: "" };
		this.search_query = "";
		this.current_view = "tasks";
		this.debounce_timer = null;

		frappe.require("/assets/do_task/css/task_dashboard.css");
		this.init();
	}

	init() {
		this.render_shell();
		this.bind_events();
		this.load_content();
	}

	render_shell() {
		this.page.main.html(`
			<div class="td-dashboard-wrapper">
				<aside class="td-sidebar">
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("Navigation")}</div>
						<div class="td-nav-item active" data-view="tasks"><i class="fa fa-list"></i> ${__("Task Board")}</div>
						<div class="td-nav-item" data-view="reports"><i class="fa fa-pie-chart"></i> ${__("Analytics")}</div>
					</div>
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("Quick Actions")}</div>
						<div class="td-nav-item" data-action="my-tasks"><i class="fa fa-user"></i> ${__("My Tasks")}</div>
						<div class="td-nav-item" data-action="clear"><i class="fa fa-refresh"></i> ${__("Reload")}</div>
					</div>
				</aside>
				<div class="td-sidebar-overlay"></div>
				<main class="td-main-content">
					<div class="td-header">
						<div class="td-title-area">
							<button class="td-sidebar-toggle"><i class="fa fa-bars"></i></button>
							<h1 id="td-view-title">${__("Task Board")}</h1>
						</div>
						<div class="td-actions">
							<div class="td-search-input-wrap">
								<i class="fa fa-search"></i>
								<input type="text" id="td-task-search" placeholder="${__("Search...")}">
							</div>
							<button class="td-btn-new" id="td-btn-new-task"><i class="fa fa-plus"></i> ${__("New Task")}</button>
						</div>
					</div>
					<div id="td-view-content"></div>
				</main>
				<button class="td-fab" id="td-fab-new-task"><i class="fa fa-plus"></i></button>
			</div>
		`);
	}

	bind_events() {
		const main = this.page.main;

		main.on("click", ".td-sidebar-toggle, .td-sidebar-overlay", () => {
			main.find(".td-sidebar").toggleClass("active");
		});

		main.on("click", ".td-nav-item", (e) => {
			const $item = $(e.currentTarget);
			const view = $item.data("view");
			const action = $item.data("action");

			if (view) {
				this.current_view = view;
				this.page_start = 0; 
				main.find(".td-nav-item").removeClass("active");
				$item.addClass("active");
				this.load_content();
			} else if (action === "my-tasks") {
				this.current_view = "tasks";
				main.find(".td-nav-item").removeClass("active");
				main.find('[data-view="tasks"]').addClass("active");
				this.filters.assigned_to = frappe.session.user;
				this.load_content();
				// The user_filter will be updated in render_tasks_frame via the value check
			} else if (action === "clear") {
				location.reload();
			}
			
			if ($(window).width() <= 1200) main.find(".td-sidebar").removeClass("active");
		});

		main.on("input", "#td-task-search", (e) => {
			clearTimeout(this.debounce_timer);
			this.debounce_timer = setTimeout(() => {
				this.search_query = $(e.currentTarget).val();
				this.page_start = 0;
				this.load_tasks(true);
			}, 400);
		});

		main.on("click", "#td-btn-new-task, #td-fab-new-task", () => this.open_task_dialog());

		// Pagination Events
		main.on("click", ".td-page-btn", (e) => {
			const $btn = $(e.currentTarget);
			const action = $btn.data("action");
			if (action === "prev" && this.page_start > 0) {
				this.page_start -= this.page_length;
			} else if (action === "next" && (this.page_start + this.page_length) < this.total_tasks) {
				this.page_start += this.page_length;
			}
			this.load_tasks(true);
			window.scrollTo({ top: 0, behavior: 'smooth' });
		});
	}

	load_content() {
		const container = this.page.main.find("#td-view-content");
		this.page.main.find("#td-view-title").text(this.current_view === "tasks" ? __("Task Board") : __("Analytics"));

		if (this.current_view === "tasks") {
			this.render_tasks_frame(container);
			this.load_tasks(true);
		} else {
			this.render_reports_frame(container);
			this.render_analytics();
		}
	}

	render_tasks_frame(container) {
		container.html(`
			<div id="td-summary-container" class="td-summary-row"></div>
			<div class="td-filters">
				<div class="td-filter-item"><label>Status</label><select data-filter="status" class="td-f-sel"><option value="">All Status</option><option value="Open">Open</option><option value="Working">Working</option><option value="Completed">Completed</option></select></div>
				<div class="td-filter-item"><label>Priority</label><select data-filter="priority" class="td-f-sel"><option value="">All Priority</option><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Urgent">Urgent</option></select></div>
				<div class="td-filter-item"><label>Project</label><div id="f-proj"></div></div>
				<div class="td-filter-item"><label>Assignee</label><div id="f-user"></div></div>
			</div>
			<div id="td-task-container" class="td-task-grid"></div>
			<div id="td-pagination-container" class="td-pagination"></div>
		`);

		// Set initial values in selects
		container.find('[data-filter="status"]').val(this.filters.status);
		container.find('[data-filter="priority"]').val(this.filters.priority);

		this.project_filter = frappe.ui.form.make_control({
			df: { fieldtype: "Link", options: "Project", placeholder: "Project", onchange: () => { this.filters.project = this.project_filter.get_value(); this.page_start = 0; this.load_tasks(true); }},
			parent: container.find("#f-proj"), render_input: true
		});
		if (this.filters.project) this.project_filter.set_value(this.filters.project);

		this.user_filter = frappe.ui.form.make_control({
			df: { fieldtype: "Link", options: "User", placeholder: "Assignee", onchange: () => { this.filters.assigned_to = this.user_filter.get_value(); this.page_start = 0; this.load_tasks(true); }},
			parent: container.find("#f-user"), render_input: true
		});
		if (this.filters.assigned_to) this.user_filter.set_value(this.filters.assigned_to);

		container.on("change", ".td-f-sel", (e) => {
			this.filters[$(e.currentTarget).data("filter")] = $(e.currentTarget).val();
			this.page_start = 0;
			this.load_tasks(true);
		});
		
		container.on("click", ".td-task-card", (e) => {
			const id = $(e.currentTarget).data("id");
			if (id) frappe.set_route("Form", "Task", id);
		});
	}

	async load_tasks(force = false) {
		const container = this.page.main.find("#td-task-container");
		const summary_container = this.page.main.find("#td-summary-container");
		
		if (force) {
			container.css("opacity", "0.5");
			if (!container.find(".td-loader").length) {
				container.prepend('<div class="td-loader"></div>');
			}
		}

		const filters = [["docstatus", "=", 0]];
		if (this.filters.status) filters.push(["status", "=", this.filters.status]);
		if (this.filters.priority) filters.push(["priority", "=", this.filters.priority]);
		if (this.filters.project) filters.push(["project", "=", this.filters.project]);
		if (this.filters.assigned_to) filters.push(["_assign", "like", `%${this.filters.assigned_to}%`]);
		if (this.search_query) filters.push(["subject", "like", `%${this.search_query}%`]);

		try {
			// Fetch tasks and total count in parallel
			const [tasks, total] = await Promise.all([
				frappe.db.get_list("Task", {
					fields: ["name", "subject", "project", "status", "priority", "progress", "exp_end_date", "_assign"],
					filters: filters,
					limit_start: this.page_start,
					limit_page_length: this.page_length,
					order_by: "modified desc"
				}),
				frappe.db.count("Task", { filters: filters })
			]);

			this.total_tasks = total;
			
			this.render_task_cards(container, tasks);
			this.render_pagination();
			this.update_summary();
			container.css("opacity", "1");
		} catch (e) {
			console.error(e);
			container.html('<div class="td-error">Failed to load tasks. Please try again.</div>');
		}
	}

	async update_summary() {
		const summary_container = this.page.main.find("#td-summary-container");
		if (!summary_container.length) return;

		try {
			// Fetch counts for summary in parallel
			const [open, urgent, completed] = await Promise.all([
				frappe.db.count("Task", { filters: { status: "Open", docstatus: 0 } }),
				frappe.db.count("Task", { filters: { priority: "Urgent", status: ["!=", "Completed"], docstatus: 0 } }),
				frappe.db.count("Task", { filters: { status: "Completed", docstatus: 0 } })
			]);

			summary_container.html(`
				<div class="td-summary-card">
					<div class="td-summary-val">${open}</div>
					<div class="td-summary-label">${__("Open Tasks")}</div>
				</div>
				<div class="td-summary-card td-summary-urgent">
					<div class="td-summary-val">${urgent}</div>
					<div class="td-summary-label">${__("Urgent Items")}</div>
				</div>
				<div class="td-summary-card">
					<div class="td-summary-val">${completed}</div>
					<div class="td-summary-label">${__("Completed")}</div>
				</div>
				<div class="td-summary-card">
					<div class="td-summary-val">${this.total_tasks}</div>
					<div class="td-summary-label">${__("Total Filtered")}</div>
				</div>
			`);
		} catch (e) {
			console.error("Summary error", e);
		}
	}

	render_task_cards(container, tasks) {
		if (!tasks.length) { 
			container.html(`
				<div class="td-empty-state">
					<i class="fa fa-tasks"></i>
					<h3>No Tasks Found</h3>
					<p>Try adjusting your filters or create a new task to get started.</p>
				</div>
			`); 
			return; 
		}
		const html = tasks.map(t => {
			let assignees = [];
			try { assignees = JSON.parse(t._assign || "[]"); } catch(e) { assignees = []; }
			
			const avatars = assignees.slice(0, 3).map(u => {
				const color = this.get_avatar_color(u);
				return `<div class="td-assignee-avatar" style="background: ${color}" title="${u}">${u.charAt(0).toUpperCase()}</div>`;
			}).join("");

			return `
				<div class="td-task-card" data-id="${t.name}">
					<div class="td-card-header">
						<div class="td-task-project">${t.project || "General"}</div>
						<h3 class="td-task-subject">${t.subject}</h3>
					</div>
					<div class="td-card-badges">
						<span class="td-badge td-badge-status-${(t.status||"Open").replace(/\s+/g,'')}">${t.status||"Open"}</span>
						<span class="td-badge td-badge-priority-${t.priority||"Medium"}">${t.priority||"Medium"}</span>
					</div>
					<div class="td-card-progress">
						<div class="td-progress-label">
							<span>Progress</span>
							<span>${parseInt(t.progress||0)}%</span>
						</div>
						<div class="td-progress-bar">
							<div class="td-progress-fill" style="width:${t.progress||0}%"></div>
						</div>
					</div>
					<div class="td-card-footer">
						<div class="td-assignees">${avatars} ${assignees.length > 3 ? `<span class="td-more-assignees">+${assignees.length - 3}</span>` : ""}</div>
						<div class="td-due-date"><i class="fa fa-calendar-o"></i> ${t.exp_end_date ? frappe.datetime.str_to_user(t.exp_end_date) : "No Due Date"}</div>
					</div>
				</div>
			`;
		}).join("");
		container.html(html);
	}

	get_avatar_color(user) {
		const colors = ["#6366f1", "#ec4899", "#8b5cf6", "#10b981", "#f59e0b", "#3b82f6"];
		let hash = 0;
		for (let i = 0; i < user.length; i++) {
			hash = user.charCodeAt(i) + ((hash << 5) - hash);
		}
		return colors[Math.abs(hash) % colors.length];
	}

	render_pagination() {
		const container = this.page.main.find("#td-pagination-container");
		const current_page = Math.floor(this.page_start / this.page_length) + 1;
		const total_pages = Math.ceil(this.total_tasks / this.page_length);

		if (total_pages <= 1) {
			container.html("");
			return;
		}

		container.html(`
			<button class="td-page-btn" data-action="prev" ${this.page_start === 0 ? "disabled" : ""}>
				<i class="fa fa-chevron-left"></i> Previous
			</button>
			<div class="td-page-info">${__("Page {0} of {1}", [current_page, total_pages])}</div>
			<button class="td-page-btn" data-action="next" ${ (this.page_start + this.page_length) >= this.total_tasks ? "disabled" : ""}>
				Next <i class="fa fa-chevron-right"></i>
			</button>
		`);
	}

	render_reports_frame(container) {
		container.html('<div class="td-stats-grid"><div class="td-stat-card"><div id="c-status"></div></div><div class="td-stat-card"><div id="c-priority"></div></div></div>');
	}

	async render_analytics() {
		const container = this.page.main.find("#td-view-content");
		container.find(".td-stat-card").append('<div class="td-chart-loader">Loading Chart...</div>');

		try {
			// Optimized analytics: fetch only necessary fields with a slightly higher limit if needed, 
			// but better yet, we just need a sample or a direct count.
			// Since we don't have a custom API, we fetch 200 items for a good sample of current state.
			const tasks = await frappe.db.get_list("Task", { 
				fields: ["status", "priority"], 
				filters: { docstatus: 0 },
				limit: 200 
			});

			container.find(".td-chart-loader").remove();

			const s_data = {}; const p_data = {};
			tasks.forEach(t => { 
				s_data[t.status] = (s_data[t.status]||0)+1; 
				p_data[t.priority] = (p_data[t.priority]||0)+1; 
			});

			new frappe.Chart("#c-status", { 
				title: "Tasks by Status",
				data: { labels: Object.keys(s_data), datasets: [{ values: Object.values(s_data) }] }, 
				type: 'donut', 
				height: 250,
				colors: ['#6366f1', '#10b981', '#f59e0b', '#ef4444']
			});

			new frappe.Chart("#c-priority", { 
				title: "Tasks by Priority",
				data: { labels: Object.keys(p_data), datasets: [{ values: Object.values(p_data) }] }, 
				type: 'bar', 
				height: 250,
				colors: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981']
			});
		} catch (e) {
			console.error("Analytics error", e);
			container.html('<div class="td-error">Failed to load analytics.</div>');
		}
	}

	open_task_dialog() {
		const d = new frappe.ui.Dialog({
			title: __("New Task"),
			fields: [
				{ label: "Subject", fieldname: "subject", fieldtype: "Data", reqd: 1 },
				{ label: "Project", fieldname: "project", fieldtype: "Link", options: "Project" },
				{ label: "Assign To", fieldname: "assign_to", fieldtype: "Link", options: "User" },
				{ label: "Company", fieldname: "company", fieldtype: "Link", options: "Company" },
				{ label: "Priority", fieldname: "priority", fieldtype: "Select", options: ["Low", "Medium", "High", "Urgent"], default: "Medium" },
				{ label: "End Date", fieldname: "exp_end_date", fieldtype: "Date" }
			],
			primary_action_label: "Create",
			primary_action: (v) => {
				const assignee = v.assign_to; delete v.assign_to;
				frappe.call({
					method: "frappe.client.insert",
					args: { doc: { doctype: "Task", ...v } },
					callback: (r) => {
						if (r.message && assignee) {
							frappe.call({ method: "frappe.desk.form.assign_to.add", args: { doctype: "Task", name: r.message.name, assign_to: [assignee] } });
						}
						d.hide(); this.load_tasks(true);
						frappe.show_alert({ message: "Task Created", indicator: "green" });
					}
				});
			}
		});
		d.show();
	}
}
