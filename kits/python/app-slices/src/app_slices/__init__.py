"""The household web app's shared slices, imported rather than stamped.

An app MOUNTS a slice (includes its router, imports its models in
`db/registry.py`), CONFIGURES it through that router's arguments, and ADDS its
own tables, routes and pages beside it. It never edits a file here; a need this
package does not meet is a request to app-factory.
"""
