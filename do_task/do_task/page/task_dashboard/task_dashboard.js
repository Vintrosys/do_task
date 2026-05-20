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

		// Task variables
		this.page_start = 0;
		this.page_length = 10;
		this.total_tasks = 0;
		this.filters = { status: "", priority: "", project: "", assigned_to: "" };
		this.search_query = "";

		// PR / Contribution variables
		this.pr_page_start = 0;
		this.pr_page_length = 10;
		this.total_contributions = 0;
		this.pr_filters = { status: "", module: "", contributer: "" };
		this.pr_search_query = "";

		this.current_view = "tasks";
		this.debounce_timer = null;

		frappe.require("/assets/do_task/css/task_dashboard.css");
		this.init();
	}

	async init() {
		this.view_type = localStorage.getItem("task_dashboard_view_type") || "card";
		await Promise.all([
			this.fetch_status_options(),
			this.fetch_pr_status_options()
		]);
		this.render_shell();
		this.update_view_active_class();
		this.bind_events();
		this.load_content();
	}

	fetch_status_options() {
		return new Promise((resolve) => {
			frappe.model.with_doctype("Task", () => {
				const meta = frappe.get_meta("Task");
				const status_field = meta && meta.fields.find(f => f.fieldname === "status");
				this.status_options = status_field && status_field.options 
					? status_field.options.split("\n").map(o => o.trim()).filter(Boolean) 
					: ["Open", "Working", "Completed", "Cancelled"];
				resolve();
			});
		});
	}

	fetch_pr_status_options() {
		return new Promise((resolve) => {
			frappe.model.with_doctype("Open Source Contribution", () => {
				const meta = frappe.get_meta("Open Source Contribution");
				const status_field = meta && meta.fields.find(f => f.fieldname === "status");
				this.pr_status_options = status_field && status_field.options 
					? status_field.options.split("\n").map(o => o.trim()).filter(Boolean) 
					: ["Open", "Merged", "Closed", "Pending Review"];
				resolve();
			});
		});
	}

	update_view_active_class() {
		const menu = this.page.main.find("#td-dropdown-menu-content");
		menu.find(".td-dropdown-item").removeClass("active");
		if (this.view_type === "list") {
			menu.find("#td-btn-list-view").addClass("active");
		} else {
			menu.find("#td-btn-card-view").addClass("active");
		}
	}

	render_shell() {
		this.page.main.html(`
			<div class="td-dashboard-wrapper">
				<aside class="td-sidebar">
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("Navigation")}</div>
						<div class="td-nav-item active" data-view="tasks"><i class="fa fa-list"></i> ${__("Task Board")}</div>
						<div class="td-nav-item" data-view="reports"><i class="fa fa-pie-chart"></i> ${__("Task Analytics")}</div>
						<div class="td-nav-item" data-view="contributions"><i class="fa fa-github"></i> ${__("Contribution")}</div>
						<div class="td-nav-item" data-view="pr_reports"><i class="fa fa-trophy"></i> ${__("PR Analysis")}</div>
					</div>
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("Quick Actions")}</div>
						<div class="td-nav-item" data-action="my-tasks"><i class="fa fa-user"></i> ${__("My Tasks")}</div>
						<div class="td-nav-item" data-action="my-prs"><i class="fa fa-github-alt"></i> ${__("My PRs")}</div>
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
							<div class="td-dropdown">
								<button class="td-btn-menu" id="td-btn-menu-trigger" title="${__("Options")}">
									<i class="fa fa-cog"></i>
								</button>
								<div class="td-dropdown-menu" id="td-dropdown-menu-content">
									<button class="td-dropdown-item" id="td-btn-reload">
										<i class="fa fa-refresh"></i> ${__("Reload")}
									</button>
									<button class="td-dropdown-item" id="td-btn-list-view">
										<i class="fa fa-list"></i> ${__("List View")}
									</button>
									<button class="td-dropdown-item" id="td-btn-card-view">
										<i class="fa fa-th"></i> ${__("Card View")}
									</button>
								</div>
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
				this.pr_page_start = 0;
				main.find(".td-nav-item").removeClass("active");
				$item.addClass("active");
				
				// Reset filters where necessary
				if (view !== "tasks" && this.filters.assigned_to) {
					this.filters.assigned_to = "";
				}
				if (view !== "contributions" && this.pr_filters.contributer) {
					this.pr_filters.contributer = "";
				}
				
				this.load_content();
			} else if (action === "my-tasks") {
				this.current_view = "tasks";
				this.page_start = 0;
				main.find(".td-nav-item").removeClass("active");
				main.find('[data-view="tasks"]').addClass("active");
				this.filters.assigned_to = frappe.session.user;
				this.load_content();
			} else if (action === "my-prs") {
				this.current_view = "contributions";
				this.pr_page_start = 0;
				main.find(".td-nav-item").removeClass("active");
				main.find('[data-view="contributions"]').addClass("active");
				this.pr_filters.contributer = frappe.session.user;
				this.load_content();
			}
			
			if ($(window).width() <= 1200) main.find(".td-sidebar").removeClass("active");
		});

		// Menu Dropdown Toggle
		main.on("click", "#td-btn-menu-trigger", (e) => {
			e.stopPropagation();
			main.find("#td-dropdown-menu-content").toggleClass("active");
		});

		$(document).on("click.td-menu-close", () => {
			main.find("#td-dropdown-menu-content").removeClass("active");
		});

		main.on("click", "#td-btn-reload", () => {
			if (this.current_view === "tasks") {
				this.load_tasks(true);
			} else if (this.current_view === "contributions") {
				this.load_contributions(true);
			} else {
				location.reload();
			}
		});

		main.on("click", "#td-btn-list-view", () => {
			this.view_type = "list";
			localStorage.setItem("task_dashboard_view_type", "list");
			this.update_view_active_class();
			if (this.current_view === "tasks") {
				this.load_tasks(true);
			} else if (this.current_view === "contributions") {
				this.load_contributions(true);
			}
		});

		main.on("click", "#td-btn-card-view", () => {
			this.view_type = "card";
			localStorage.setItem("task_dashboard_view_type", "card");
			this.update_view_active_class();
			if (this.current_view === "tasks") {
				this.load_tasks(true);
			} else if (this.current_view === "contributions") {
				this.load_contributions(true);
			}
		});

		main.on("input", "#td-task-search", (e) => {
			clearTimeout(this.debounce_timer);
			this.debounce_timer = setTimeout(() => {
				const val = $(e.currentTarget).val();
				if (this.current_view === "tasks") {
					this.search_query = val;
					this.page_start = 0;
					this.load_tasks(true);
				} else if (this.current_view === "contributions") {
					this.pr_search_query = val;
					this.pr_page_start = 0;
					this.load_contributions(true);
				}
			}, 400);
		});

		main.on("click", "#td-btn-new-task, #td-fab-new-task", () => {
			if (this.current_view === "tasks") {
				this.open_task_dialog();
			} else if (this.current_view === "contributions") {
				this.open_pr_dialog();
			}
		});

		// Pagination Events
		main.on("click", ".td-page-btn", (e) => {
			const $btn = $(e.currentTarget);
			const action = $btn.data("action");
			if (this.current_view === "tasks") {
				if (action === "prev" && this.page_start > 0) {
					this.page_start -= this.page_length;
				} else if (action === "next" && (this.page_start + this.page_length) < this.total_tasks) {
					this.page_start += this.page_length;
				}
				this.load_tasks(true);
			} else if (this.current_view === "contributions") {
				if (action === "prev" && this.pr_page_start > 0) {
					this.pr_page_start -= this.pr_page_length;
				} else if (action === "next" && (this.pr_page_start + this.pr_page_length) < this.total_contributions) {
					this.pr_page_start += this.pr_page_length;
				}
				this.load_contributions(true);
			}
			window.scrollTo({ top: 0, behavior: 'smooth' });
		});
	}

	load_content() {
		const container = this.page.main.find("#td-view-content");
		const main = this.page.main;
		
		if (this.current_view === "tasks") {
			main.find("#td-view-title").text(__("Task Board"));
			main.find(".td-search-input-wrap").show().find("input").val(this.search_query).attr("placeholder", __("Search tasks..."));
			main.find(".td-dropdown").show();
			main.find("#td-btn-new-task").show().html(`<i class="fa fa-plus"></i> ${__("New Task")}`);
			main.find("#td-fab-new-task").show();
			this.render_tasks_frame(container);
			this.load_tasks(true);
		} else if (this.current_view === "reports") {
			main.find("#td-view-title").text(__("Task Analytics"));
			main.find(".td-search-input-wrap").hide();
			main.find(".td-dropdown").hide();
			main.find("#td-btn-new-task").hide();
			main.find("#td-fab-new-task").hide();
			this.render_reports_frame(container);
			this.render_analytics();
		} else if (this.current_view === "contributions") {
			main.find("#td-view-title").text(__("Contribution"));
			main.find(".td-search-input-wrap").show().find("input").val(this.pr_search_query).attr("placeholder", __("Search PRs..."));
			main.find(".td-dropdown").show();
			main.find("#td-btn-new-task").show().html(`<i class="fa fa-plus"></i> ${__("New PR")}`);
			main.find("#td-fab-new-task").show();
			this.render_contributions_frame(container);
			this.load_contributions(true);
		} else if (this.current_view === "pr_reports") {
			main.find("#td-view-title").text(__("PR Analysis"));
			main.find(".td-search-input-wrap").hide();
			main.find(".td-dropdown").hide();
			main.find("#td-btn-new-task").hide();
			main.find("#td-fab-new-task").hide();
			this.render_pr_reports_frame(container);
			this.render_pr_analytics();
		}
	}

	render_tasks_frame(container) {
		const status_options_html = (this.status_options || []).map(opt => `<option value="${opt}">${opt}</option>`).join("");
		container.html(`
			<div class="td-filters">
				<div class="td-filter-item">
					<label>Status</label>
					<select data-filter="status" class="td-f-sel">
						<option value="">All Status</option>
						${status_options_html}
					</select>
				</div>
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
		
		container.on("click", ".td-task-card, .td-task-list-row", (e) => {
			const id = $(e.currentTarget).data("id");
			if (id) frappe.set_route("Form", "Task", id);
		});

		container.on("click", ".td-btn-timesheet", (e) => {
			e.stopPropagation();
			const id = $(e.currentTarget).data("id");
			if (id) {
				frappe.set_route("List", "Timesheet", {"task": id});
			}
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
		if (this.view_type === "list") {
			container.removeClass("td-task-grid").addClass("td-task-list");
		} else {
			container.removeClass("td-task-list").addClass("td-task-grid");
		}

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

			if (this.view_type === "list") {
				return `
					<div class="td-task-list-row" data-id="${t.name}">
						<div class="td-list-col td-list-project-subject">
							<span class="td-task-project">${t.project || "General"}</span>
							<h3 class="td-task-subject">${t.subject}</h3>
						</div>
						<div class="td-list-col td-list-badges">
							<span class="td-badge td-badge-status-${(t.status||"Open").replace(/\s+/g,'')}">${t.status||"Open"}</span>
							<span class="td-badge td-badge-priority-${t.priority||"Medium"}">${t.priority||"Medium"}</span>
						</div>
						<div class="td-list-col td-list-progress">
							<div class="td-progress-bar">
								<div class="td-progress-fill" style="width:${t.progress||0}%"></div>
							</div>
							<span class="td-progress-percent">${parseInt(t.progress||0)}%</span>
						</div>
						<div class="td-list-col td-list-assignees">
							<div class="td-assignees">${avatars} ${assignees.length > 3 ? `<span class="td-more-assignees">+${assignees.length - 3}</span>` : ""}</div>
						</div>
						<div class="td-list-col td-list-due">
							<div class="td-due-date"><i class="fa fa-calendar-o"></i> ${t.exp_end_date ? frappe.datetime.str_to_user(t.exp_end_date) : "No Due Date"}</div>
						</div>
						<div class="td-list-col td-list-timesheet" style="flex: 1.2; justify-content: center;">
							<button class="td-btn-timesheet" data-id="${t.name}">
								<i class="fa fa-clock-o"></i> View Timesheet
							</button>
						</div>
					</div>
				`;
			}

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
					<div style="margin-top: 8px;">
						<button class="td-btn-timesheet" style="width: 100%;" data-id="${t.name}">
							<i class="fa fa-clock-o"></i> View Timesheet
						</button>
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
		if (!container.length) return;

		if (this.current_view === "tasks") {
			if (this.total_tasks <= this.page_length) {
				container.html("");
				return;
			}
			const current_page = Math.floor(this.page_start / this.page_length) + 1;
			const total_pages = Math.ceil(this.total_tasks / this.page_length);
			container.html(`
				<button class="td-page-btn" data-action="prev" ${this.page_start === 0 ? "disabled" : ""}>
					<i class="fa fa-chevron-left"></i> Previous
				</button>
				<div class="td-page-info">${__("Page {0} of {1}", [current_page, total_pages])}</div>
				<button class="td-page-btn" data-action="next" ${ (this.page_start + this.page_length) >= this.total_tasks ? "disabled" : ""}>
					Next <i class="fa fa-chevron-right"></i>
				</button>
			`);
		} else if (this.current_view === "contributions") {
			if (this.total_contributions <= this.pr_page_length) {
				container.html("");
				return;
			}
			const current_page = Math.floor(this.pr_page_start / this.pr_page_length) + 1;
			const total_pages = Math.ceil(this.total_contributions / this.pr_page_length);
			container.html(`
				<button class="td-page-btn" data-action="prev" ${this.pr_page_start === 0 ? "disabled" : ""}>
					<i class="fa fa-chevron-left"></i> Previous
				</button>
				<div class="td-page-info">${__("Page {0} of {1}", [current_page, total_pages])}</div>
				<button class="td-page-btn" data-action="next" ${ (this.pr_page_start + this.pr_page_length) >= this.total_contributions ? "disabled" : ""}>
					Next <i class="fa fa-chevron-right"></i>
				</button>
			`);
		}
	}

	render_reports_frame(container) {
		container.html('<div class="td-stats-grid"><div class="td-stat-card"><div id="c-status"></div></div><div class="td-stat-card"><div id="c-priority"></div></div></div>');
	}

	async render_analytics() {
		const container = this.page.main.find("#td-view-content");
		container.find(".td-stat-card").append('<div class="td-chart-loader">Loading Chart...</div>');

		try {
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
				{ label: "Task Group", fieldname: "task_group", fieldtype: "Link", options: "Task Group" },
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

	render_contributions_frame(container) {
		const status_options_html = (this.pr_status_options || []).map(opt => `<option value="${opt}">${opt}</option>`).join("");
		container.html(`
			<div class="td-filters">
				<div class="td-filter-item">
					<label>Status</label>
					<select data-filter="status" class="td-f-sel">
						<option value="">All Status</option>
						${status_options_html}
					</select>
				</div>
				<div class="td-filter-item"><label>Module</label><div id="f-module"></div></div>
				<div class="td-filter-item"><label>Contributor</label><div id="f-contributer"></div></div>
			</div>
			<div id="td-contributions-container" class="td-task-grid"></div>
			<div id="td-pagination-container" class="td-pagination"></div>
		`);

		container.find('[data-filter="status"]').val(this.pr_filters.status);

		this.module_filter = frappe.ui.form.make_control({
			df: {
				fieldtype: "Link",
				options: "Task Group",
				placeholder: "Module",
				onchange: () => {
					this.pr_filters.module = this.module_filter.get_value();
					this.pr_page_start = 0;
					this.load_contributions(true);
				}
			},
			parent: container.find("#f-module"),
			render_input: true
		});
		if (this.pr_filters.module) this.module_filter.set_value(this.pr_filters.module);

		this.contributer_filter = frappe.ui.form.make_control({
			df: {
				fieldtype: "Link",
				options: "User",
				placeholder: "Contributor",
				onchange: () => {
					this.pr_filters.contributer = this.contributer_filter.get_value();
					this.pr_page_start = 0;
					this.load_contributions(true);
				}
			},
			parent: container.find("#f-contributer"),
			render_input: true
		});
		if (this.pr_filters.contributer) this.contributer_filter.set_value(this.pr_filters.contributer);

		container.on("change", ".td-f-sel", (e) => {
			this.pr_filters[$(e.currentTarget).data("filter")] = $(e.currentTarget).val();
			this.pr_page_start = 0;
			this.load_contributions(true);
		});

		container.on("click", ".td-task-card, .td-task-list-row", (e) => {
			if ($(e.target).closest('.td-btn-timesheet').length) return; // Prevent navigation if clicking timesheet button
			const id = $(e.currentTarget).data("id");
			if (id) frappe.set_route("Form", "Open Source Contribution", id);
		});
	}

	async load_contributions(force = false) {
		const container = this.page.main.find("#td-contributions-container");
		if (!container.length) return;

		if (force) {
			container.css("opacity", "0.5");
			if (!container.find(".td-loader").length) {
				container.prepend('<div class="td-loader"></div>');
			}
		}

		const filters = [["docstatus", "=", 0]];
		if (this.pr_filters.status) filters.push(["status", "=", this.pr_filters.status]);
		if (this.pr_filters.module) filters.push(["module", "=", this.pr_filters.module]);
		if (this.pr_filters.contributer) filters.push(["contributer", "=", this.pr_filters.contributer]);
		if (this.pr_search_query) filters.push(["subject", "like", `%${this.pr_search_query}%`]);

		try {
			const [contributions, total] = await Promise.all([
				frappe.db.get_list("Open Source Contribution", {
					fields: ["name", "subject", "module", "status", "pr_descriptiom", "comments", "contributer", "owner", "creation"],
					filters: filters,
					limit_start: this.pr_page_start,
					limit_page_length: this.pr_page_length,
					order_by: "modified desc"
				}),
				frappe.db.count("Open Source Contribution", { filters: filters })
			]);

			this.total_contributions = total;
			this.render_contribution_cards(container, contributions);
			this.render_pagination();
			container.css("opacity", "1");
		} catch (e) {
			console.error(e);
			container.html('<div class="td-error">Failed to load contributions. Please try again.</div>');
		}
	}

	render_contribution_cards(container, contributions) {
		if (contributions.length === 0) {
			container.removeClass("td-task-list").addClass("td-task-grid");
			container.html(`
				<div class="td-empty-state">
					<i class="fa fa-github"></i>
					<h3>No Contributions Found</h3>
					<p>Try adjusting your filters or create a new contribution to get started.</p>
				</div>
			`);
			return;
		}

		const status_map = {
			"Open": "open",
			"Merged": "completed",
			"Closed": "cancelled",
			"Pending Review": "working"
		};

		if (this.view_type === "list") {
			container.removeClass("td-task-grid").addClass("td-task-list");
			const html = contributions.map(item => {
				const description = item.pr_descriptiom ? frappe.ellipsis(item.pr_descriptiom, 100) : "No description provided";
				const contributor = item.contributer || item.owner;
				const user_avatar = frappe.avatar(contributor);

				return `
					<div class="td-task-list-row" data-id="${item.name}">
						<div class="td-list-col td-list-project-subject">
							<span class="td-task-project">${item.module || "No Module"}</span>
							<h3 class="td-task-subject">${item.subject}</h3>
						</div>
						<div class="td-list-col" style="flex: 1.5; color: var(--td-text-muted); font-size: 13px;">
							${description}
						</div>
						<div class="td-list-col td-list-badges">
							<span class="td-badge td-badge-status-${status_map[item.status] || 'open'}">${item.status}</span>
						</div>
						<div class="td-list-col td-list-assignees">
							<div class="td-assignee" title="Contributor: ${contributor}" style="width: 32px; height: 32px; display: inline-block;">${user_avatar}</div>
						</div>
						<div class="td-list-col td-list-due">
							<div class="td-due-date">
								<i class="fa fa-calendar"></i> ${frappe.datetime.global_date_format(item.creation)}
							</div>
						</div>
					</div>
				`;
			}).join("");
			container.html(html);
		} else {
			container.removeClass("td-task-list").addClass("td-task-grid");
			const html = contributions.map(item => {
				const description = item.pr_descriptiom ? frappe.ellipsis(item.pr_descriptiom, 120) : "No description provided";
				const contributor = item.contributer || item.owner;
				const user_avatar = frappe.avatar(contributor);

				return `
					<div class="td-task-card" data-id="${item.name}">
						<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
							<span class="td-task-project">${item.module || "No Module"}</span>
							<span class="td-badge td-badge-status-${status_map[item.status] || 'open'}">${item.status}</span>
						</div>
						<h3 class="td-task-subject">${item.subject}</h3>
						<p style="color: var(--td-text-muted); font-size: 13px; line-height: 1.5; margin: 12px 0;">${description}</p>
						<div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--td-border); padding-top: 12px; margin-top: auto;">
							<div class="td-due-date" style="color: var(--td-text-muted); font-size: 12px;">
								<i class="fa fa-calendar"></i> ${frappe.datetime.global_date_format(item.creation)}
							</div>
							<div class="td-assignees" style="display: flex; gap: 4px;">
								<div class="td-assignee" title="Contributor: ${contributor}" style="width: 32px; height: 32px; display: inline-block;">${user_avatar}</div>
							</div>
						</div>
					</div>
				`;
			}).join("");
			container.html(html);
		}
	}

	render_pr_reports_frame(container) {
		container.html(`
			<div class="td-stats-grid">
				<div class="td-stat-card"><div id="pr-c-status"></div></div>
				<div class="td-stat-card"><div id="pr-c-module"></div></div>
			</div>
			<div class="td-leaderboard-card" style="margin-top: 24px; background: var(--td-bg-card, #fff); border: 1px solid var(--td-border, #e5e7eb); border-radius: 12px; padding: 24px;">
				<h3 style="margin-top: 0; margin-bottom: 20px; font-size: 16px; font-weight: 600; color: var(--td-text-main, #111827); display: flex; align-items: center; gap: 8px;">
					<i class="fa fa-trophy" style="color: #f59e0b;"></i> ${__("Contributor Leaderboard")}
				</h3>
				<div id="td-leaderboard-content"></div>
			</div>
		`);
	}

	async render_pr_analytics() {
		const container = this.page.main.find("#td-view-content");
		container.find(".td-stat-card").append('<div class="td-chart-loader">Loading Chart...</div>');

		try {
			const contributions = await frappe.db.get_list("Open Source Contribution", {
				fields: ["status", "module", "contributer", "owner"],
				filters: { docstatus: 0 },
				limit: 200
			});

			container.find(".td-chart-loader").remove();

			const s_data = {};
			const m_data = {};
			const leaders = {};

			contributions.forEach(item => {
				s_data[item.status] = (s_data[item.status] || 0) + 1;
				const module_name = item.module || "Unassigned";
				m_data[module_name] = (m_data[module_name] || 0) + 1;
				
				const user = item.contributer || item.owner || "Unknown";
				leaders[user] = (leaders[user] || 0) + 1;
			});

			new frappe.Chart("#pr-c-status", {
				title: "Contributions by Status",
				data: { labels: Object.keys(s_data), datasets: [{ values: Object.values(s_data) }] },
				type: 'donut',
				height: 250,
				colors: ['#10b981', '#6366f1', '#ef4444', '#f59e0b']
			});

			new frappe.Chart("#pr-c-module", {
				title: "Contributions by Module",
				data: { labels: Object.keys(m_data), datasets: [{ values: Object.values(m_data) }] },
				type: 'bar',
				height: 250,
				colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
			});

			// Render Leaderboard
			const sorted_leaders = Object.entries(leaders)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 10);

			const leaderboard_container = container.find("#td-leaderboard-content");
			if (sorted_leaders.length === 0) {
				leaderboard_container.html(`<div style="color: var(--td-text-muted); font-size: 13px;">No contributions found to rank.</div>`);
			} else {
				let leader_html = `<div class="td-leaderboard-list" style="display: flex; flex-direction: column; gap: 12px;">`;
				sorted_leaders.forEach(([user, count], index) => {
					const rank = index + 1;
					let rank_badge = `<span style="font-weight: 600; width: 24px; text-align: center; color: var(--td-text-muted);">${rank}</span>`;
					if (rank === 1) rank_badge = `<span style="font-size: 16px; width: 24px; text-align: center;">🥇</span>`;
					else if (rank === 2) rank_badge = `<span style="font-size: 16px; width: 24px; text-align: center;">🥈</span>`;
					else if (rank === 3) rank_badge = `<span style="font-size: 16px; width: 24px; text-align: center;">🥉</span>`;

					const user_avatar = frappe.avatar(user);

					leader_html += `
						<div class="td-leaderboard-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-radius: 8px; background: var(--td-bg-body, #f9fafb); border: 1px solid var(--td-border, #f3f4f6);">
							<div style="display: flex; align-items: center; gap: 12px;">
								${rank_badge}
								<div style="width: 32px; height: 32px; display: inline-block; margin-left: 8px;">${user_avatar}</div>
								<div style="font-weight: 500; color: var(--td-text-main); font-size: 14px; margin-left: 8px;">${user}</div>
							</div>
							<div style="display: flex; align-items: center; gap: 6px;">
								<span style="font-weight: 600; color: var(--td-primary); font-size: 15px;">${count}</span>
								<span style="color: var(--td-text-muted); font-size: 12px;">${count === 1 ? 'PR' : 'PRs'}</span>
							</div>
						</div>
					`;
				});
				leader_html += `</div>`;
				leaderboard_container.html(leader_html);
			}
		} catch (e) {
			console.error("PR Analytics error", e);
			container.html('<div class="td-error">Failed to load analytics.</div>');
		}
	}

	open_pr_dialog() {
		const d = new frappe.ui.Dialog({
			title: __("New Open Source Contribution"),
			fields: [
				{ label: "Subject", fieldname: "subject", fieldtype: "Data", reqd: 1 },
				{ label: "Module", fieldname: "module", fieldtype: "Link", options: "Task Group", reqd: 1 },
				{ label: "Status", fieldname: "status", fieldtype: "Select", options: ["Merged", "Open", "Closed", "Pending Review"], default: "Open", reqd: 1 },
				{ label: "Contributor", fieldname: "contributer", fieldtype: "Link", options: "User", default: frappe.session.user },
				{ label: "PR Descriptiom", fieldname: "pr_descriptiom", fieldtype: "Small Text" },
				{ label: "Comments", fieldname: "comments", fieldtype: "Small Text" }
			],
			primary_action_label: "Create",
			primary_action: (v) => {
				frappe.call({
					method: "frappe.client.insert",
					args: { doc: { doctype: "Open Source Contribution", ...v } },
					callback: (r) => {
						if (!r.exc) {
							d.hide();
							frappe.show_alert({ message: __("Contribution created successfully"), indicator: "green" });
							this.load_contributions(true);
						}
					}
				});
			}
		});
		d.show();
	}
}
