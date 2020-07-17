import { EditorProps, EditorView } from "prosemirror-view";
import { Schema } from "prosemirror-model";
import { Plugin, PluginKey } from "./plugin";
import { EditorState } from "./state";
import { Transaction } from "./transaction";

/**
 * This is the type passed to the [`Plugin`](#state.Plugin)
 * constructor. It provides a definition for a plugin.
 */
export interface PluginSpec<T = any, S extends Schema = any> {
  /**
   * The [view props](#view.EditorProps) added by this plugin. Props
   * that are functions will be bound to have the plugin instance as
   * their `this` binding.
   */
  props?: EditorProps<Plugin<T, S>, S> | null;
  /**
   * Allows a plugin to define a [state field](#state.StateField), an
   * extra slot in the state object in which it can keep its own data.
   */
  state?: StateField<T, S> | null;
  /**
   * Can be used to make this a keyed plugin. You can have only one
   * plugin with a given key in a given state, but it is possible to
   * access the plugin's configuration and state through the key,
   * without having access to the plugin instance object.
   */
  key?: PluginKey<T, S> | null;
  /**
   * When the plugin needs to interact with the editor view, or
   * set something up in the DOM, use this field. The function
   * will be called when the plugin's state is associated with an
   * editor view.
   */
  view?:
    | ((
        p: EditorView<S>
      ) => {
        update?: ((view: EditorView<S>, prevState: EditorState<S>) => void) | null;
        destroy?: (() => void) | null;
      })
    | null;
  /**
   * When present, this will be called before a transaction is
   * applied by the state, allowing the plugin to cancel it (by
   * returning false).
   */
  filterTransaction?: ((p1: Transaction<S>, p2: EditorState<S>) => boolean) | null;
  /**
   * Allows the plugin to append another transaction to be applied
   * after the given array of transactions. When another plugin
   * appends a transaction after this was called, it is called again
   * with the new state and new transactions—but only the new
   * transactions, i.e. it won't be passed transactions that it
   * already saw.
   */
  appendTransaction?:
    | ((
        transactions: Array<Transaction<S>>,
        oldState: EditorState<S>,
        newState: EditorState<S>
      ) => Transaction<S> | null | undefined | void)
    | null;
}

/**
 * A plugin spec may provide a state field (under its
 * [`state`](#state.PluginSpec.state) property) of this type, which
 * describes the state it wants to keep. Functions provided here are
 * always called with the plugin instance as their `this` binding.
 */
export interface StateField<T = any, S extends Schema = Schema> {
  /**
   * Initialize the value of the field. `config` will be the object
   * passed to [`EditorState.create`](#state.EditorState^create). Note
   * that `instance` is a half-initialized state instance, and will
   * not have values for plugin fields initialized after this one.
   */
  init(this: Plugin<T, S>, config: { [key: string]: any }, instance: EditorState<S>): T;
  /**
   * Apply the given transaction to this state field, producing a new
   * field value. Note that the `newState` argument is again a partially
   * constructed state does not yet contain the state from plugins
   * coming after this one.
   */
  apply(this: Plugin<T, S>, tr: Transaction<S>, value: T, oldState: EditorState<S>, newState: EditorState<S>): T;
  /**
   * Convert this field to JSON. Optional, can be left off to disable
   * JSON serialization for the field.
   */
  toJSON?: ((this: Plugin<T, S>, value: T) => any) | null;
  /**
   * Deserialize the JSON representation of this field. Note that the
   * `state` argument is again a half-initialized state.
   */
  fromJSON?: ((this: Plugin<T, S>, config: { [key: string]: any }, value: any, state: EditorState<S>) => T) | null;
}
