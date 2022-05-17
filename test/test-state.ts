import {EditorState, TextSelection, Plugin, PluginKey} from "prosemirror-state"
import {schema, eq, doc, p} from "prosemirror-test-builder"
import ist from "ist"

const messageCountKey = new PluginKey("messageCount")
const messageCountPlugin = new Plugin({
  key: messageCountKey,
  state: {
    init() { return 0 },
    apply(_, count) { return count + 1 },
    toJSON(count) { return count },
    fromJSON(_, count) { return count }
  },
  props: {
    testProp() { return this }
  } as any
})

const transactionPlugin = new Plugin({
  filterTransaction(tr) { return !tr.getMeta("filtered") },
  appendTransaction(trs, _, state) {
    let last = trs[trs.length - 1]
    if (last && last.getMeta("append")) return state.tr.insertText("A")
  }
})

describe("State", () => {
  it("creates a default doc", () => {
    let state = EditorState.create({schema})
    ist(state.doc, doc(p()), eq)
  })

  it("creates a default selection", () => {
    let state = EditorState.create({doc: doc(p("foo"))})
    ist(state.selection.from, 1)
    ist(state.selection.to, 1)
  })

  it("applies transform transactions", () => {
    let state = EditorState.create({schema})
    let newState = state.apply(state.tr.insertText("hi"))
    ist(state.doc, doc(p()), eq)
    ist(newState.doc, doc(p("hi")), eq)
    ist(newState.selection.from, 3)
  })

  it("supports plugin fields", () => {
    let state = EditorState.create({plugins: [messageCountPlugin], schema})
    let newState = state.apply(state.tr).apply(state.tr)
    ist(messageCountPlugin.getState(state), 0)
    ist(messageCountPlugin.getState(newState), 2)
  })

  it("can be serialized to JSON", () => {
    let state = EditorState.create({plugins: [messageCountPlugin], doc: doc(p("ok"))})
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)))
    let pluginProps = {count: messageCountPlugin}
    let expected = {doc: {type: "doc", content: [{type: "paragraph", content:
                                                  [{type: "text", text: "ok"}]}]},
                    selection: {type: "text", anchor: 3, head: 3},
                    count: 1}
    let json = state.toJSON(pluginProps)
    ist(JSON.stringify(json), JSON.stringify(expected))
    let copy = EditorState.fromJSON({plugins: [messageCountPlugin], schema}, json, pluginProps)
    ist(copy.doc, state.doc, eq)
    ist(copy.selection.from, 3)
    ist(messageCountPlugin.getState(copy), 1)

    let limitedJSON = state.toJSON()
    ist(limitedJSON.doc)
    ist(limitedJSON.messageCount$, undefined)
    let deserialized = EditorState.fromJSON({plugins: [messageCountPlugin], schema}, limitedJSON)
    ist(messageCountPlugin.getState(deserialized), 0)
  })

  it("supports specifying and persisting storedMarks", () => {
    let state = EditorState.create({doc: doc(p("ok")), storedMarks: [schema.mark("em")]})
    ist(state.storedMarks!.length, 1)
    let copy = EditorState.fromJSON({schema}, state.toJSON())
    ist(copy.storedMarks!.length, 1)
  })

  it("supports reconfiguration", () => {
    let state = EditorState.create({plugins: [messageCountPlugin], schema})
    ist(messageCountPlugin.getState(state), 0)
    let without = state.reconfigure({})
    ist(messageCountPlugin.getState(without), undefined)
    ist(without.plugins.length, 0)
    ist(without.doc, doc(p()), eq)
    let reAdd = without.reconfigure({plugins: [messageCountPlugin]})
    ist(messageCountPlugin.getState(reAdd), 0)
    ist(reAdd.plugins.length, 1)
  })

  it("allows plugins to filter transactions", () => {
    let state = EditorState.create({plugins: [transactionPlugin], schema})
    let applied = state.applyTransaction(state.tr.insertText("X"))
    ist(applied.state.doc, doc(p("X")), eq)
    ist(applied.transactions.length, 1)
    applied = state.applyTransaction(state.tr.insertText("Y").setMeta("filtered", true))
    ist(applied.state, state)
    ist(applied.transactions.length, 0)
  })

  it("allows plugins to append transactions", () => {
    let state = EditorState.create({plugins: [transactionPlugin], schema})
    let applied = state.applyTransaction(state.tr.insertText("X").setMeta("append", true))
    ist(applied.state.doc, doc(p("XA")), eq)
    ist(applied.transactions.length, 2)
  })

  it("stores a reference to a root transaction for appended transactions", () => {
    let state = EditorState.create({schema, plugins: [new Plugin({
      appendTransaction: (_trs, _oldState, newState) => newState.tr.insertText("Y")
    })]})
    let {transactions} = state.applyTransaction(state.tr.insertText("X"))
    ist(transactions.length, 2)
    ist(transactions[1].getMeta("appendedTransaction"), transactions[0])
  })

  it("supports JSON.stringify toJSON arguments", () => {
    let someObject = { someKey: EditorState.create({schema}) }
    ist(JSON.stringify(someObject).length > 0)
  })
})

describe("Plugin", () => {
  it("calls prop functions bound to the plugin", () => {
    ist((messageCountPlugin.props as any).testProp(), messageCountPlugin)
  })

  it("can be found by key", () => {
    let state = EditorState.create({plugins: [messageCountPlugin], schema})
    ist(messageCountKey.get(state), messageCountPlugin)
    ist(messageCountKey.getState(state), 0)
  })

  it("generates new keys", () => {
    let p1 = new Plugin({}), p2 = new Plugin({})
    ist(p1.key != p2.key)
    let k1 = new PluginKey("foo"), k2 = new PluginKey("foo")
    ist(k1.key != k2.key)
  })
})
