import * as _ from "lodash";
import { GUI } from "dat.gui";

// Clear gui wrapper on refresh
export function init_gui(): GUI {
  _.each(document.getElementsByClassName("dg main"), (elem) => {
    elem.remove();
  });

  return new GUI();
}

export function add_folder<V extends object>(
  gui: GUI,
  folder_name: string,
  obj: V,
  opts?: {
    [name: string]: number[] | [number[]] | [string[]] | [object];
  },
  subset?: string[] | boolean,
) {
  const folder = gui.addFolder(folder_name);
  if (!subset) {
    subset = _.keys(obj);
  } else if (typeof subset == "boolean") {
    subset = _.keys(opts);
  }

  _.each(subset, (name: string) => {
    if (!opts) {
      opts = {};
    }
    const opt = opts[name] ?? [];

    // @ts-expect-error
    const control = folder.add(obj, name, ...opt).listen();
  });

  return folder;
}
