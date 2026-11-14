# Ownership and access

No personal identities or credentials have been supplied. Roles below are
responsibilities to assign before launch; they do not claim someone has access.

| Responsibility                                              | Accountable role                        | Access boundary                                               |
| ----------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| Approve factual content, prices, legal entity, media rights | Business owner                          | Admin owner; core edits reviewed in all seven locales         |
| Review core translations                                    | Owner-designated language reviewers     | Human approval is distinct from Codex authorship              |
| Publish/Undo content and prices                             | Owner / manager                         | RBAC and sensitive-action reauthentication                    |
| Review/merge code and migrations                            | Maintainer                              | Protected branches and PR review                              |
| Deploy / approve production                                 | Named deploy operator + owner           | Protected GitHub environment, unique SSH key, pinned host key |
| Backups, restore drills, monitoring and incidents           | Deploy operator                         | Owner-only server secrets and off-site recovery vault         |
| Handle booking requests and privacy requests                | Authorized owner/manager/sales per RBAC | No DB/admin secrets sent to translators                       |

Before launch, the owner records actual names and an incident contact privately.
No shared SSH credentials. Offboarding removes SSH/deploy keys and registry
access, disables admin identity, revokes sessions and rotates exposed secrets.
