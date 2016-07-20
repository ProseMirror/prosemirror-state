// !! This module implements the state object of a ProseMirror editor.

const {Mark} = require("../model")
const {Mapping} = require("../transform")

const {Selection} = require("./selection")
const {EditorTransform} = require("./transform")

class ViewState {
  constructor(inDOMChange, domChangeMapping, scrollToSelection) {
    this.inDOMChange = inDOMChange
    this.domChangeMapping = domChangeMapping
    this.scrollToSelection = scrollToSelection
  }
}
ViewState.initial = new ViewState(null, null, false)
exports.ViewState = ViewState

class FieldDesc {
  constructor(name, desc) {
    this.name = name
    this.init = desc.init
    this.applyTransform = desc.applyTransform || (state => state[name])
    this.applySelection = desc.applySelection || (state => state[name])
  }
}

const baseFields = [
  new FieldDesc("doc", {
    init(doc) { return doc },
    applyTransform(state, transform) {
      if (!transform.before.eq(state.doc))
        throw new RangeError("Applying a transform that does not start with the current document")
      return transform.doc
    }
  }),

  new FieldDesc("selection", {
    init(_, selection) { return selection },
    applyTransform(state, transform, options) {
      return options.selection || state.selection.map(transform.doc, transform.mapping)
    },
    applySelection(_, selection) { return selection }
  }),

  new FieldDesc("storedMarks", {
    init() { return null },
    applyTransform(state, _, options) { return options.selection ? null : state.storedMarks },
    applySelection() { return null }
  }),

  new FieldDesc("view", {
    init() { return ViewState.initial },
    applyTransform(state, transform, options) {
      return new ViewState(state.view.inDOMChange,
                           state.view.domChangeMapping && state.view.domChangeMapping.copy().appendMapping(transform.mapping),
                           options.scrollIntoView ? true : options.selection ? false : state.view.scrollToSelection)
    },
    applySelection(state, _, options) {
      return new ViewState(state.view.inDOMChange, state.view.domChangeMapping, !!options.scrollIntoView)
    }
  })
]

function buildStateClass(plugins) {
  let fields = baseFields.slice()

  class EditorState {
    // :: Schema
    get schema() {
      return this.doc.type.schema
    }

    // :: (Object) → EditorState
    // Create a new state object by updating some of the fields in the
    // current object.
    update(updated) {
      let newInstance = new EditorState
      for (let i = 0; i < fields.length; i++) {
        let name = fields[i].name
        newInstance[name] = hasProp(updated, name) ? updated[name] : this[name]
      }
      return newInstance
    }

    applyTransform(transform, options = nullOptions) {
      let newInstance = new EditorState
      for (let i = 0; i < fields.length; i++)
        newInstance[fields[i].name] = fields[i].applyTransform(this, transform, options)
      return newInstance
    }

    applySelection(selection, options = nullOptions) {
      if (typeof selection == "number") selection = Selection.near(this.doc.resolve(selection))
      let newInstance = new EditorState
      for (let i = 0; i < fields.length; i++)
        newInstance[fields[i].name] = fields[i].applySelection(this, selection, options)
      return newInstance
    }

    addActiveMark(mark) {
      let set = this.storedMarks
      if (this.selection.empty) set = mark.addToSet(set || currentMarks(this.doc, this.selection))
      return set == this.storedMarks ? this : this.update({storedMarks: set})
    }

    removeActiveMark(markType) {
      let set = this.storedMarks
      if (this.selection.empty) set = markType.removeFromSet(set || currentMarks(this.doc, this.selection))
      return set == this.storedMarks ? this : this.update({storedMarks: set})
    }

    startDOMChange(id) {
      return this.update({view: new ViewState(id, new Mapping, this.view.scrollToSelection)})
    }

    endDOMChange() {
      return this.update({view: new ViewState(null, null, this.view.scrollToSelection)})
    }

    // :: EditorTransform
    // Create a selection-aware `Transform` object.
    get tr() { return new EditorTransform(this) }

    static create(config) {
      let doc = config.doc || config.schema.nodes.doc.createAndFill()
      let selection = config.selection || Selection.atStart(doc)
      let instance = new EditorState
      for (let i = 0; i < fields.length; i++)
        instance[fields[i].name] = fields[i].init(doc, selection)
      return instance
    }
  }

  plugins.forEach(plugin => {
    if (plugin.stateFields) Object.keys(plugin.stateFields).forEach(name => {
      if (fields.some(f => f.name == name) || EditorState.prototype.hasOwnProperty(name))
        throw new Error("Conflicting definition for state field " + name)
      fields.push(new FieldDesc(name, plugin.stateFields[name]))
    })
    if (plugin.stateMethods) Object.keys(plugin.stateMethods).forEach(name => {
      if (fields.some(f => f.name == name) || EditorState.prototype.hasOwnProperty(name))
        throw new Error("Conflicting definition for state field " + name)
      EditorState.prototype[name] = plugin.stateMethods[name]
    })
  })

  return EditorState
}
exports.buildStateClass = buildStateClass

function currentMarks(doc, selection) {
  return selection.head == null ? Mark.none : doc.marksAt(selection.head)
}

const nullOptions = {}

function hasProp(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}
