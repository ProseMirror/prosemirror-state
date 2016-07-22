// !! This module implements the state object of a ProseMirror editor.

;({Selection: exports.Selection,
   TextSelection: exports.TextSelection,
   NodeSelection: exports.NodeSelection} = require("./selection"))

exports.EditorTransform = require("./transform").EditorTransform

exports.EditorState = require("./state").EditorState
