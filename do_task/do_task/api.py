import frappe

@frappe.whitelist()
def get_projects_for_user():
    """
    Fetch projects where the current user is assigned in the 'users' child table.
    """
    user = frappe.session.user
    
    # Query projects where user is in the 'users' table
    projects = frappe.db.get_list("Project",
        filters={
            "docstatus": 0,
            "status": ["!=", "Completed"]
        },
        fields=["name", "project_name"],
        order_by="project_name asc"
    )
    
    # Filter projects by checking the 'users' child table manually or via a join
    # Since we want to bypass the field permission issue, we use a query that checks the child table
    
    assigned_projects = []
    for p in projects:
        # Check if user is the owner OR assigned in the child table
        is_owner = frappe.db.get_value("Project", p.name, "owner") == user
        is_assigned = frappe.db.exists("Project User", {"parent": p.name, "user": user})
        
        if is_owner or is_assigned:
            assigned_projects.append(p)
            
    return assigned_projects

@frappe.whitelist()
def create_do_task_workspace():
    workspace_name = "Do Task"
    
    # Check if Workspace already exists
    if not frappe.db.exists("Workspace", workspace_name):
        doc = frappe.new_doc("Workspace")
        doc.name = workspace_name
        doc.title = workspace_name
        doc.label = workspace_name
        doc.module = "Do Task"
        doc.category = "Modules"
        doc.icon = "check-square"
        doc.is_standard = 1
        doc.public = 1
        
        # Add links
        doc.append("links", {
            "label": "Task Dashboard",
            "type": "Link",
            "link_type": "Page",
            "link_to": "task_dashboard"
        })
        doc.append("links", {
            "label": "Project Owner Dashboard",
            "type": "Link",
            "link_type": "Page",
            "link_to": "project_owner_dashboard"
        })
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
    else:
        # Optionally update links if workspace already exists
        doc = frappe.get_doc("Workspace", workspace_name)
        
        # Remove any existing PR Dashboard link from Workspace
        pr_links = [l for l in doc.links if l.link_to == "pr_dashboard"]
        if pr_links:
            for pr_l in pr_links:
                doc.remove(pr_l)
            doc.save(ignore_permissions=True)
            frappe.db.commit()
            doc = frappe.get_doc("Workspace", workspace_name)

        # Verify if our pages are in the links
        existing_links = [l.link_to for l in doc.links]
        updated = False
        
        for label, page_name in [
            ("Task Dashboard", "task_dashboard"),
            ("Project Owner Dashboard", "project_owner_dashboard")
        ]:
            if page_name not in existing_links:
                doc.append("links", {
                    "label": label,
                    "type": "Link",
                    "link_type": "Page",
                    "link_to": page_name
                })
                updated = True
        if updated:
            doc.save(ignore_permissions=True)
            frappe.db.commit()
    return doc.as_dict()










