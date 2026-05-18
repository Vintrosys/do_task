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
