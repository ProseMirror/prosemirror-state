function copyObj(from, to) {
  for (let prop in from) to[prop] = from[prop]
  return to
}

const ids = Object.create(null)

function getID(name) {
  if (name in ids) return name + "$" + ++ids[name]
  ids[name] = 0
  return name + "$"
}

// ::- Plugins wrap extra functionality that can be added to an
// editor. They can define new [state fields](#state.StateField), and
// add [view props](#view.EditorProps).
//
// There are two ways to use plugins. The easiest way is to have a
// factory function that simply creates instances of this class. This
// creates a non-unique plugin, of which multiple instances can be
// added to a single editor.
//
// The alternative is to have a single plugin instance, and optionally
// derive different configurations from it using
// [`configure`](#state.Plugin.configure). This creates a _unique_
// plugin, which means that an error is raised when multiple instances
// are added to a single editor. You can find the instance of such a
// plugin in a state by calling its [`find`](#state.Plugin.find)
// method.
class Plugin {
  // :: (Object)
  // Create a plugin.
  //
  //   options::-
  //
  //     props:: ?EditorProps
  //     The [view props](#view.EditorProps) added by this plugin.
  //
  //     state:: ?StateField
  //     A [state field](#state.StateField) defined by this plugin.
  //
  //     name:: ?string
  //     The name of the plugin. Used for debug purposes, and to
  //     derive a property name for the plugin's state field, if any.
  //
  //     config:: ?Object
  //     A set of plugin-specific configuration parameters used by
  //     this plugin.
  //
  //     dependencies:: ?[Plugin]
  //     A set of plugins that should automatically be added to the
  //     plugin set when this plugin is added.
  constructor(options, id) {
    // :: EditorProps
    // The props exported by this plugin.
    this.props = options.props || {}
    // :: Object
    // The plugin's configuration object.
    this.config = options.config || {}
    this.options = options
    this.id = id || getID(options.name || "plugin")
  }

  // :: (Object) → Plugin
  // Create a reconfigured instance of this plugin. Any config fields
  // not listed in the given object are inherited from the original
  // configuration.
  configure(config) {
    return new Plugin(copyObj({
      config: copyObj(config, copyObj(this.config, {}))
    }, copyObj(this.options, {})), this.id)
  }

  // :: (EditorState) → ?Plugin
  // Find the instance of this plugin in a given editor state, if it
  // exists. Note that this only works if the plugin in the state is
  // either this exact plugin, or they both share a common ancestor
  // through [`configure`](#state.Plugin.configure) calls.
  find(state) { return state.config.findPlugin(this) }

  // :: (EditorState) → any
  // Get the state field for this plugin.
  getState(state) { return state[this.id] }
}
exports.Plugin = Plugin

// StateField:: interface<T>
// A plugin may provide a state field (under its `state` property)
// of this type, which describes the state it wants to keep.
//
//   init:: (config: Object, instance: EditorState) → T
//   Initialize the value of this field. `config` will be the object
//   passed to [`EditorState.create`](#state.EditorState^create). Note
//   that `instance` is a half-initialized state instance, and will
//   not have values for any fields initialzed after this one.
//
//   applyAction:: (state: EditorState, action: Action) → T
//   Apply the given action to this state field, producing a new field
//   value. Note that the `state` argument is the _old_ state, before
//   the action was applied.
//
//   toJSON:: ?(value: T) → *
//   Convert this field to JSON. Optional, can be left off to disable
//   JSON serialization for the field.
//
//   fromJSON:: ?(config: Object, value: *, state: EditorState) → T
//   Deserialize the JSON representation of this field. Note that the
//   `state` argument is again a half-initialized state.
