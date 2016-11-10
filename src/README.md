This module implements the state object of a ProseMirror editor, along
with the representation of the selection and the plugin abstraction.

### Editor State

ProseMirror keeps all editor state (the things, basically, that would
be required to create an editor just like the current one) in a single
[object](#state.EditorState). That object is updated (creating a new
state) by applying [actions](#state.Action) to it.

@EditorState
@Action
@TransformAction
@SelectionAction
@AddStoredMarkAction
@RemoveStoredMarkAction
@EditorTransform

It is possible, when dispatching an action, to change it before
applying it. The following helper can be used to safely update
transform actions:

@extendTransformAction

### Selection

A ProseMirror selection can be either a classical
[text selection](#state.TextSelection) (of which cursors are a special
case), or a [_node_ selection](#state.NodeSelection), where a specific
document node is selected.

@Selection
@TextSelection
@NodeSelection
c
### Plugin System

To make distributing and using extra editor functionality easier,
ProseMirror has a plugin system.

@Plugin
@StateField
@PluginKey
