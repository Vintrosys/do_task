/**
 * project_owner_dashboard.js
 * Specialized dashboard for Project Owners
 */

frappe.provide("frappe.ui.pages");

frappe.pages["project_owner_dashboard"].on_page_load = function (wrapper) {
	wrapper._project_owner_dashboard = new ProjectOwnerDashboard(wrapper);
};

class ProjectOwnerDashboard {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Project Owner Dashboard"),
			single_column: true,
		});

		this.page_start = 0;
		this.page_length = 10;
		this.total_tasks = 0;
		this.filters = { status: "", priority: "", project: "", assigned_to: "" };
		this.search_query = "";
		this.current_view = "tasks";
		this.owned_projects = [];
		
		frappe.require("/assets/do_task/css/task_dashboard.css");
		this.init();
	}

	async init() {
		this.render_shell();
		await this.fetch_owned_projects();
		
		if (this.owned_projects.length === 0) {
			this.render_no_access();
			return;
		}

		// Default to first project if not set
		if (!this.filters.project) {
			this.filters.project = this.owned_projects[0].name;
		}

		this.bind_events();
		this.load_content();
	}

	async fetch_owned_projects() {
		try {
			const r = await frappe.call({
				method: "do_task.do_task.api.get_projects_for_user"
			});
			this.owned_projects = r.message || [];
		} catch (e) {
			console.error("Error fetching projects", e);
			this.owned_projects = [];
		}
	}

	render_shell() {
		this.page.main.html(`
			<div class="td-dashboard-wrapper">
				<aside class="td-sidebar">
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("My Projects")}</div>
						<div id="td-owned-projects-list"></div>
					</div>
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("Navigation")}</div>
						<div class="td-nav-item active" data-view="tasks"><i class="fa fa-list"></i> ${__("Project Tasks")}</div>
						<div class="td-nav-item" data-view="reports"><i class="fa fa-pie-chart"></i> ${__("Analytics")}</div>
					</div>
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("Quick Actions")}</div>
						<div class="td-nav-item" data-action="clear"><i class="fa fa-refresh"></i> ${__("Reload Dashboard")}</div>
					</div>
				</aside>
				<div class="td-sidebar-overlay"></div>
				<main class="td-main-content">
					<div class="td-header">
						<div class="td-title-area">
							<button class="td-sidebar-toggle"><i class="fa fa-bars"></i></button>
							<h1 id="td-view-title">${__("Project Tasks")}</h1>
						</div>
						<div class="td-actions">
							<div class="td-search-input-wrap">
								<i class="fa fa-search"></i>
								<input type="text" id="td-task-search" placeholder="${__("Search tasks...")}">
							</div>
							<button class="td-btn-new" id="td-btn-new-task"><i class="fa fa-plus"></i> ${__("New Task")}</button>
						</div>
					</div>
					<div id="td-view-content"></div>
				</main>
			</div>
		`);
	}

	render_no_access() {
		this.page.main.find("#td-view-content").html(`
			<div class="td-empty-state" style="margin-top: 100px;">
				<i class="fa fa-lock" style="font-size: 48px; color: var(--text-muted);"></i>
				<h3>Access Restricted</h3>
				<p>You are not assigned to any active project in the system.</p>
			</div>
		`);
		this.page.set_title(__("Dashboard Restricted"));
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
			} else if (action === "clear") {
				location.reload();
			}
			if ($(window).width() <= 1200) main.find(".td-sidebar").removeClass("active");
		});

		main.on("click", ".td-project-item", (e) => {
			const $item = $(e.currentTarget);
			this.filters.project = $item.data("project");
			this.page_start = 0;
			main.find(".td-project-item").removeClass("active");
			$item.addClass("active");
			this.load_content();
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

		main.on("click", "#td-btn-new-task", () => this.open_task_dialog());

		main.on("click", ".td-page-btn", (e) => {
			const action = $(e.currentTarget).data("action");
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
		this.render_projects_list();
		
		const project_name = this.owned_projects.find(p => p.name === this.filters.project)?.project_name || this.filters.project;
		this.page.main.find("#td-view-title").text(this.current_view === "tasks" ? __("Tasks: {0}", [project_name]) : __("Analytics: {0}", [project_name]));

		if (this.current_view === "tasks") {
			this.render_tasks_frame(container);
			this.load_tasks(true);
		} else {
			this.render_reports_frame(container);
			this.render_analytics();
		}
	}

	render_projects_list() {
		const list_container = this.page.main.find("#td-owned-projects-list");
		const html = this.owned_projects.map(p => `
			<div class="td-nav-item td-project-item ${this.filters.project === p.name ? 'active' : ''}" data-project="${p.name}">
				<i class="fa fa-briefcase"></i> ${p.project_name || p.name}
			</div>
		`).join("");
		list_container.html(html);
	}

	render_tasks_frame(container) {
		container.html(`
			<div id="td-summary-container" class="td-summary-row"></div>
			<div class="td-filters">
				<div class="td-filter-item"><label>Status</label><select data-filter="status" class="td-f-sel"><option value="">All Status</option><option value="Open">Open</option><option value="Working">Working</option><option value="Completed">Completed</option></select></div>
				<div class="td-filter-item"><label>Priority</label><select data-filter="priority" class="td-f-sel"><option value="">All Priority</option><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Urgent">Urgent</option></select></div>
				<div class="td-filter-item"><label>Assignee</label><div id="f-user"></div></div>
			</div>
			<div id="td-task-container" class="td-task-grid"></div>
			<div id="td-pagination-container" class="td-pagination"></div>
		`);

		container.find('[data-filter="status"]').val(this.filters.status);
		container.find('[data-filter="priority"]').val(this.filters.priority);

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
		if (force) {
			container.css("opacity", "0.5");
			if (!container.find(".td-loader").length) container.prepend('<div class="td-loader"></div>');
		}

		const filters = [["docstatus", "=", 0], ["project", "=", this.filters.project]];
		if (this.filters.status) filters.push(["status", "=", this.filters.status]);
		if (this.filters.priority) filters.push(["priority", "=", this.filters.priority]);
		if (this.filters.assigned_to) filters.push(["_assign", "like", `%${this.filters.assigned_to}%`]);
		if (this.search_query) filters.push(["subject", "like", `%${this.search_query}%`]);

		try {
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
			container.html('<div class="td-error">Failed to load tasks.</div>');
		}
	}

	async update_summary() {
		const summary_container = this.page.main.find("#td-summary-container");
		if (!summary_container.length) return;

		try {
			const base_filters = { project: this.filters.project, docstatus: 0 };
			const [open, urgent, completed] = await Promise.all([
				frappe.db.count("Task", { filters: { ...base_filters, status: "Open" } }),
				frappe.db.count("Task", { filters: { ...base_filters, priority: "Urgent", status: ["!=", "Completed"] } }),
				frappe.db.count("Task", { filters: { ...base_filters, status: "Completed" } })
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
					<div class="td-summary-label">${__("Project Total")}</div>
				</div>
			`);
		} catch (e) {}
	}

	render_task_cards(container, tasks) {
		if (!tasks.length) { 
			container.html(`<div class="td-empty-state"><i class="fa fa-tasks"></i><h3>No Tasks Found</h3></div>`); 
			return; 
		}
		const html = tasks.map(t => {
			let assignees = [];
			try { assignees = JSON.parse(t._assign || "[]"); } catch(e) {}
			const avatars = assignees.slice(0, 3).map(u => `<div class="td-assignee-avatar" title="${u}">${u.charAt(0).toUpperCase()}</div>`).join("");

			return `
				<div class="td-task-card" data-id="${t.name}">
					<div class="td-card-header">
						<h3 class="td-task-subject">${t.subject}</h3>
					</div>
					<div class="td-card-badges">
						<span class="td-badge td-badge-status-${(t.status||"Open").replace(/\s+/g,'')}">${t.status||"Open"}</span>
						<span class="td-badge td-badge-priority-${t.priority||"Medium"}">${t.priority||"Medium"}</span>
					</div>
					<div class="td-card-progress">
						<div class="td-progress-bar"><div class="td-progress-fill" style="width:${t.progress||0}%"></div></div>
					</div>
					<div class="td-card-footer">
						<div class="td-assignees">${avatars}</div>
						<div class="td-due-date">${t.exp_end_date ? frappe.datetime.str_to_user(t.exp_end_date) : ""}</div>
					</div>
				</div>
			`;
		}).join("");
		container.html(html);
	}

	render_pagination() {
		const container = this.page.main.find("#td-pagination-container");
		const current_page = Math.floor(this.page_start / this.page_length) + 1;
		const total_pages = Math.ceil(this.total_tasks / this.page_length);
		if (total_pages <= 1) { container.html(""); return; }

		container.html(`
			<button class="td-page-btn" data-action="prev" ${this.page_start === 0 ? "disabled" : ""}>Prev</button>
			<div class="td-page-info">${__("Page {0} of {1}", [current_page, total_pages])}</div>
			<button class="td-page-btn" data-action="next" ${ (this.page_start + this.page_length) >= this.total_tasks ? "disabled" : ""}>Next</button>
		`);
	}

	render_reports_frame(container) {
		container.html('<div class="td-stats-grid"><div class="td-stat-card"><div id="c-status"></div></div><div class="td-stat-card"><div id="c-priority"></div></div></div>');
	}

	async render_analytics() {
		const container = this.page.main.find("#td-view-content");
		try {
			const tasks = await frappe.db.get_list("Task", { 
				fields: ["status", "priority"], 
				filters: { docstatus: 0, project: this.filters.project },
				limit: 200 
			});
			const s_data = {}; const p_data = {};
			tasks.forEach(t => { 
				s_data[t.status] = (s_data[t.status]||0)+1; 
				p_data[t.priority] = (p_data[t.priority]||0)+1; 
			});
			new frappe.Chart("#c-status", { title: "By Status", data: { labels: Object.keys(s_data), datasets: [{ values: Object.values(s_data) }] }, type: 'donut', height: 200 });
			new frappe.Chart("#c-priority", { title: "By Priority", data: { labels: Object.keys(p_data), datasets: [{ values: Object.values(p_data) }] }, type: 'bar', height: 200 });
		} catch (e) {}
	}

	open_task_dialog() {
		const d = new frappe.ui.Dialog({
			title: __("New Task for {0}", [this.filters.project]),
			fields: [
				{ label: "Subject", fieldname: "subject", fieldtype: "Data", reqd: 1 },
				{ label: "Project", fieldname: "project", fieldtype: "Link", options: "Project", default: this.filters.project, read_only: 1 },
				{ label: "Assign To", fieldname: "assign_to", fieldtype: "Link", options: "User" },
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
