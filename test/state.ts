const {EditorState, Selection, TextSelection, NodeSelection} = require("..")

// Wrapper object to make writing state tests easier.

function selFor(doc) {
  let a = doc.tag.a
  if (a != null) {
    let $a = doc.resolve(a)
    if ($a.parent.inlineContent) return new TextSelection($a, doc.tag.b != null ? doc.resolve(doc.tag.b) : undefined)
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

  apply(tr) {
    this.state = this.state.apply(tr)
  }

  command(cmd) {
    cmd(this.state, tr => this.apply(tr))
  }

  type(text) {
    this.apply(this.tr.insertText(text))
  }

  deleteSelection() {
    this.apply(this.state.tr.deleteSelection())
  }

  textSel(anchor, head) {
    let sel = TextSelection.create(this.state.doc, anchor, head)
    this.state = this.state.apply(this.state.tr.setSelection(sel))
  }

  nodeSel(pos) {
    let sel = NodeSelection.create(this.state.doc, pos)
    this.state = this.state.apply(this.state.tr.setSelection(sel))
  }

  get doc() { return this.state.doc }
  get selection() { return this.state.selection }
  get tr() { return this.state.tr }
}
