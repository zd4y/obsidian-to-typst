import { string, type Type } from "cmd-ts";
import type { OutputOf } from "cmd-ts/dist/cjs/type.js";
import { liquidEngine } from "./ofmToTypst.js";
import type { Template } from "liquidjs";

export const ReadStringToTemplate: Type<string, Template[]> = {
  async from(str) {
    return liquidEngine.parse(str);
  },
};

export const ReadFileToTemplate: Type<string, Template[]> = {
  async from(str) {
    return liquidEngine.parseFile(str);
  },
};

export type MappedOption<T> = Record<string, T | undefined>;

export function ReadMappedOption<T extends Type<string, any>>(
  toType: T,
): Type<string[], MappedOption<OutputOf<T>>> {
  return {
    ...toType,
    async from(values: string[]): Promise<OutputOf<T>> {
      const defaultValues = values.filter((str) => str.indexOf(":") === -1);
      if (defaultValues.length > 1) {
        throw new Error(
          `option contains more than one default value: ${defaultValues}`,
        );
      }
      let defaultValue = defaultValues[0];
      if (defaultValue) {
        values = values.filter((v) => v !== defaultValue);
        defaultValue = await toType.from(defaultValue);
      }

      const entryPromises = values.map(async (str) => {
        const [key, ...rest] = str.split(":");
        const value = await toType.from(rest.join(":"));
        return [key, value];
      });
      const entries = await Promise.all(entryPromises);

      const handler = {
        get: function (target: any, name: string) {
          return target.hasOwnProperty(name) ? target[name] : defaultValue;
        },
      };
      const ret = Object.fromEntries(entries);
      return new Proxy(ret, handler);
    },
  };
}

export const ReadMappedOptionToString = ReadMappedOption(string);

export const ReadMappedOptionToTemplateFromString =
  ReadMappedOption(ReadStringToTemplate);
