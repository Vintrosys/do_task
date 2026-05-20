# Copyright (c) 2026, Harrish and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class OpenSourceContribution(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		comments: DF.SmallText | None
		contributer: DF.Link | None
		module: DF.Link
		pr_descriptiom: DF.SmallText | None
		status: DF.Literal["Merged", "Open", "Closed", "Pending Review"]
		subject: DF.Data
	# end: auto-generated types

	pass
