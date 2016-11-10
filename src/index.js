;({Selection: exports.Selection,
   TextSelection: exports.TextSelection,
   NodeSelection: exports.NodeSelection,
   isSelectable: exports.isSelectable} = require("./selection"))

;({EditorTransform: exports.EditorTransform,
   extendTransformAction: exports.extendTransformAction} = require("./transform"))

exports.EditorState = require("./state").EditorState

;({Plugin: exports.Plugin, PluginKey: exports.PluginKey} = require("./plugin"))
