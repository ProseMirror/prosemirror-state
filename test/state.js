const {EditorState, Selection, TextSelection, NodeSelection} = require("../dist")

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

  command(cmd) {
    cmd(this.state, action => this.apply(action))
  }

  type(text) {
    this.apply(this.tr.replaceSelection(this.state.schema.text(text)))
  }

  deleteSelection() {
    this.apply(this.state.tr.deleteSelection().action())
  }

  textSel(anchor, head) {
    let sel = TextSelection.create(this.state.doc, anchor, head)
    this.state = this.state.applyAction(sel.action())
  }

  nodeSel(pos) {
    let sel = NodeSelection.create(this.state.doc, pos)
    this.state = this.state.applyAction(sel.action())
  }

  get doc() { return this.state.doc }
  get selection() { return this.state.selection }
  get tr() { return this.state.tr }
}
