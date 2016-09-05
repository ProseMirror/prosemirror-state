const {EditorState, Selection, TextSelection, NodeSelection} = require("../src")

// Wrapper object to make writing state tests easier.

function selFor(doc) {
  let a = doc.tag.a
  if (a != null) {
    let $a = doc.resolve(a)
    if ($a.parent.isTextblock) return new TextSelection($a, doc.tag.b != null ? doc.resolve(doc.tag.b) : undefined)
    else return new NodeSelection($a)
  }
  return Selection.atStart(doc)
}
exports.selFor = selFor

exports.TestState = class TestState {
  constructor(config) {
    if (!config.selection && config.doc) config.selection = selFor(config.doc)
    this.state = EditorState.create(config)
  }

  apply(action) {
    this.state = this.state.applyAction(action.steps ? action.action() : action)
  }

  type(text) {
    this.apply(this.tr.replaceSelection(this.state.schema.text(text)))
  }

  deleteSelection() {
    this.apply(this.state.tr.deleteSelection().action())
  }

  textSel(anchor, head) {
    let sel = new TextSelection(this.state.doc.resolve(anchor),
                                head == null ? undefined : this.state.doc.resolve(head))
    this.state = this.state.applyAction(sel.action())
  }

  nodeSel(pos) {
    let sel = new NodeSelection(this.state.doc.resolve(pos))
    this.state = this.state.applyAction(sel.action())
  }

  get doc() { return this.state.doc }
  get selection() { return this.state.selection }
  get tr() { return this.state.tr }
}
