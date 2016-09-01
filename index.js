// !!
// This module implements the state object of a ProseMirror editor,
// along with the representation of the selection and the plugin
// abstraction.

;({Selection: exports.Selection,
   TextSelection: exports.TextSelection,
   NodeSelection: exports.NodeSelection} = require("./selection"))

exports.EditorTransform = require("./transform").EditorTransform

exports.EditorState = require("./state").EditorState

exports.Plugin = require("./plugin").Plugin
