// ../../opt/node-v24.19.0-linux-arm64/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  if (a === b) return true;
  if (!strict && isNullable(a) && isNullable(b)) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (!a || !b) return false;
  function check(test, then) {
    return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
  }
  return check(Array.isArray, (a2, b2) => a2.length === b2.length && a2.every((item, index) => deepEqual(item, b2[index]))) ?? check(is("Date"), (a2, b2) => a2.valueOf() === b2.valueOf()) ?? check(is("RegExp"), (a2, b2) => a2.source === b2.source && a2.flags === b2.flags) ?? check(isArrayBufferLike, (a2, b2) => {
    if (a2.byteLength !== b2.byteLength) return false;
    const viewA = new Uint8Array(a2);
    const viewB = new Uint8Array(b2);
    for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
    return true;
  }) ?? Object.keys({
    ...a,
    ...b
  }).every((key) => deepEqual(a[key], b[key], strict));
}
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// ../../opt/node-v24.19.0-linux-arm64/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = Symbol.for("schemastery");
var kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
var resolvers = {};
Schema.extend = function extend(type, resolve3) {
  resolvers[type] = resolve3;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name2, keys, format) {
  formatters[name2] = format;
  Object.assign(Schema, { [name2](...args) {
    const schema = new Schema({ type: name2 });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name2 === "object" || name2 === "dict") schema.meta.default = {};
    else if (name2 === "array" || name2 === "tuple") schema.meta.default = [];
    else if (name2 === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// lib/settings-local.js
var NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
function settingsNamespace(value) {
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new TypeError(`settings namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`);
  }
  return value;
}
var FIBER_DISPOSED = 4;
var FIBER_UNLOADING = 5;
function isUnloading(ctx) {
  const state = ctx.fiber.state;
  return state === FIBER_UNLOADING || state === FIBER_DISPOSED;
}
function installSettingsSection(ctx, ns, schema, entry, hooks) {
  ctx.inject(["settings"], (sctx) => {
    const scope = sctx.settings.register(ns, schema, {
      base: entry,
      ...hooks.validate === void 0 ? {} : { validate: hooks.validate }
    });
    hooks.setSource(() => scope.get());
    sctx.effect(() => () => {
      if (isUnloading(ctx)) return;
      hooks.setSource(() => entry);
      hooks.onChange();
    });
    hooks.onChange();
    scope.watch(() => {
      if (isUnloading(ctx)) return;
      hooks.onChange();
    });
  });
}

// lib/home-local.js
import { homedir } from "node:os";
import { join, resolve as resolve2 } from "node:path";
var DSH_HOME_ENV = "DSH_HOME";
function expandHomePath(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}
function dshHomePath(...segments) {
  const fromEnv2 = process.env[DSH_HOME_ENV];
  const home = fromEnv2 !== void 0 && fromEnv2.trim().length > 0 ? fromEnv2 : join(homedir(), ".dsh");
  return join(resolve2(expandHomePath(home)), ...segments);
}

// lib/bridge.js
import { readFileSync, writeFileSync, readlinkSync } from "node:fs";
import { loadavg } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

// lib/telegram.js
function createTelegramClient({ tgApiBase, botToken, timeoutMs = 3e4 }) {
  const base = `${tgApiBase}/bot${botToken}`;
  async function call(method, params = {}, opts = {}) {
    const doFetch = () => {
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
      return fetch(`${base}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
        signal
      });
    };
    try {
      const res = await doFetch();
      const j = await res.json();
      if (!j.ok) throw new Error(`tg ${method}: ${j.description ?? JSON.stringify(j)}`);
      return j.result;
    } catch (e) {
      if (opts.noRetry || e?.name === "AbortError" || !/fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(String(e?.message))) throw e;
      const res = await doFetch();
      const j = await res.json();
      if (!j.ok) throw new Error(`tg ${method}: ${j.description ?? JSON.stringify(j)}`);
      return j.result;
    }
  }
  return { call, base };
}

// lib/markdown.js
var MDV2_SPECIAL = /([_*[\]()~`>#+\-=|{}.!\\])/g;
var UNESCAPE = /\\([_*[\]()~`>#+\-=|{}.!\\])/g;
function escMarkdownV2(s) {
  return s.replace(MDV2_SPECIAL, "\\$1");
}
function plainToTg(s) {
  let out = s.replace(MDV2_SPECIAL, "\\$1");
  out = out.replace(/\\\*\\\*([^*]+?)\\\*\\\*/g, "**$1**");
  out = out.replace(/(^|[^\\])\\\*([^*\\]+?)\\\*/g, "$1*$2*");
  out = out.replace(/\\\[([^\]\\]+?)\\\]\(\\\(([^)\\]+?)\\\)/g, "[$1]($2)");
  return out;
}
function inlineToTg(s) {
  const tokens = [];
  const codeRe = /(`+)([\s\S]*?)\1/g;
  let last = 0, m;
  while (m = codeRe.exec(s)) {
    tokens.push({ t: "plain", s: s.slice(last, m.index) });
    tokens.push({ t: "code", s: m[2] });
    last = m.index + m[0].length;
  }
  tokens.push({ t: "plain", s: s.slice(last) });
  let out = "";
  for (const tk of tokens) {
    if (tk.t === "code") out += "`" + tk.s.replace(/\\/g, "\\\\").replace(/`/g, "\\`") + "`";
    else out += plainToTg(tk.s);
  }
  return out;
}
function isTableRow(line) {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 2;
}
function isTableSep(line) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && /-/.test(line);
}
function tableToPre(rows) {
  const parsed = rows.map((r) => {
    let s = r.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);
    return s.split("|").map((c) => c.trim());
  });
  const nCols = Math.max(1, ...parsed.map((r) => r.length));
  const widths = [];
  for (let c = 0; c < nCols; c++) widths[c] = Math.max(3, ...parsed.map((r) => (r[c] ?? "").length));
  const fmt = (cells) => "| " + cells.map((c, i) => (c ?? "").padEnd(widths[i])).join(" | ") + " |";
  const lines = parsed.map((r) => r.every((c) => /^:?-+:?$/.test(c)) ? "| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |" : fmt(r));
  return "```\n" + lines.join("\n") + "\n```";
}
function formatForTelegram(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      const buf = [line.replace(/^(\s*)```.*$/, "$1```")];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        buf.push(lines[i].replace(/\\/g, "\\\\").replace(/`/g, "\\`"));
        i++;
      }
      if (i < lines.length) buf.push(lines[i].replace(/^(\s*)```.*$/, "$1```"));
      i++;
      out.push(buf.join("\n"));
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const rows = [line];
      i++;
      rows.push(lines[i]);
      i++;
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      out.push(tableToPre(rows));
      continue;
    }
    let m = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (m) {
      out.push("*" + escMarkdownV2(m[2]) + "*");
      i++;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push("\u2015".repeat(24));
      i++;
      continue;
    }
    m = line.match(/^\s*[-*+]\s+(.*)$/);
    if (m) {
      out.push("\u2022 " + inlineToTg(m[1]));
      i++;
      continue;
    }
    m = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (m) {
      out.push(escMarkdownV2(m[1]) + "\\. " + inlineToTg(m[2]));
      i++;
      continue;
    }
    out.push(inlineToTg(line));
    i++;
  }
  return out.join("\n");
}
function unescapeMarkdownV2(s) {
  return s.replace(UNESCAPE, "$1");
}

// lib/bridge.js
var dshHomeLogPath = dshHomePath("dsh-web.log");
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var MESSAGE_LIMIT = 4e3;
var SETTINGS_NS = "tg-bridge";
var I18N = {
  working: { zh: "\u{1F916} \u6536\u5230\uFF0Cagent \u5F00\u59CB\u5E72\u6D3B\u2026", en: "\u{1F916} Got it, the agent is working\u2026" },
  turnTimeout: { zh: "\u23F0 10 \u5206\u949F\u8D85\u65F6\uFF0Cagent \u53EF\u80FD\u8FD8\u5728\u8DD1\uFF0C\u7A0D\u540E\u67E5\u7F51\u9875\u7AEF\u3002", en: "\u23F0 10-minute timeout; the agent may still be running. Check the web UI later." },
  startOk: { zh: "DSH \u6865\u63A5\u5728\u7EBF \u2705 \u76F4\u63A5\u53D1\u6D88\u606F\u5373\u53EF\u3002", en: "DSH bridge online \u2705 Send a message to start." },
  unauthorized: { zh: "\u26D4 \u672A\u6388\u6743\uFF0C\u6682\u65F6\u65E0\u6CD5\u4F7F\u7528\u3002\n\u4F60\u7684 Chat ID\uFF1A{id}\n{hint}", en: "\u26D4 Not authorized yet.\nYour Chat ID: {id}\n{hint}" },
  unauthorizedHintAdmin: { zh: "\u628A Chat ID \u53D1\u7ED9\u7BA1\u7406\u5458\uFF08{admin}\uFF09\u5373\u53EF\u5F00\u901A\u3002", en: "Send this Chat ID to the admin ({admin}) to get access." },
  unauthorizedHintNone: { zh: "\u5F53\u524D\u90E8\u7F72\u672A\u914D\u7F6E\u7BA1\u7406\u5458\uFF0C\u9700\u8981\u7BA1\u7406\u5458\u5728\u914D\u7F6E\u6587\u4EF6\u91CC\u6388\u6743\u3002", en: "This deployment has no admin configured; an admin must authorize you in the config file." },
  handleError: { zh: "\u274C \u51FA\u9519\u4E86\uFF1A{err}", en: "\u274C Error: {err}" },
  restartDone: { zh: "\u{1F504} \u91CD\u542F\u5B8C\u6210\n\n{body}", en: "\u{1F504} Restart complete\n\n{body}" },
  noSessions: { zh: "\u6682\u65E0\u4F1A\u8BDD\u3002\u76F4\u63A5\u53D1\u6D88\u606F\u4F1A\u81EA\u52A8\u521B\u5EFA\uFF0C\u6216\u7528 /use new \u65B0\u5EFA\u3002", en: "No sessions yet. Send a message to create one, or /use new." },
  sessionsHeader: { zh: "\u{1F4CB} \u4F1A\u8BDD\u5217\u8868\uFF08\u5171 {n} \u4E2A\uFF09:{owner}", en: "\u{1F4CB} Sessions ({n}):{owner}" },
  sessionsOwner: { zh: "\n\uFF08\u7BA1\u7406\u5458\u89C6\u56FE\uFF1ADSH \u5168\u90E8\u4F1A\u8BDD\uFF0C\u542B Web \u7AEF\u521B\u5EFA\u7684\uFF09", en: "\n(admin view: all DSH sessions, incl. web-created)" },
  sessionsHint: { zh: "\u7528 /use <\u7F16\u53F7|ID|\u6807\u9898> \u5207\u6362\uFF0C/rename <\u65B0\u6807\u9898> \u91CD\u547D\u540D\uFF0C/use new \u65B0\u5EFA\u4F1A\u8BDD\uFF08\u53EF\u5148\u9009\u6A21\u5F0F\uFF09\u3002", en: "/use <num|ID|title> to switch, /rename <title> to rename, /use new to create (pick a mode first)." },
  srcTg: { zh: "[TG {label}]", en: "[TG {label}]" },
  srcWeb: { zh: "[Web]", en: "[Web]" },
  useCreated: { zh: "\u{1F195} \u5DF2\u65B0\u5EFA\u5E76\u5207\u6362\u5230\u4F1A\u8BDD {sid}", en: "\u{1F195} Created and switched to session {sid}" },
  useNewPickMode: { zh: "\u{1F195} \u65B0\u5EFA\u4F1A\u8BDD \u2014 \u5148\u9009\u6A21\u5F0F\uFF08\u521B\u5EFA\u540E\u5373\u56FA\u5B9A\uFF0C\u53D1\u7B2C\u4E00\u6761\u6D88\u606F\u524D\u4ECD\u53EF\u6362\uFF09\uFF1A", en: "\u{1F195} New session \u2014 pick a mode first (fixed at creation, switchable until the first message):" },
  useNewCreated: { zh: "\u2705 \u5DF2\u7528 {mode} \u6A21\u5F0F\u65B0\u5EFA\u5E76\u5207\u6362\u5230\u4F1A\u8BDD {sid}", en: "\u2705 Created and switched to session {sid} in {mode} mode" },
  useAmbiguous: { zh: "\u{1F914} \u201C{target}\u201D \u5339\u914D\u5230 {n} \u4E2A\u4F1A\u8BDD\uFF0C\u7528\u7F16\u53F7\u9009\u4E00\u4E2A\uFF1A\n\n{list}", en: "\u{1F914} \u201C{target}\u201D matches {n} sessions; pick one by number:\n\n{list}" },
  useNotFound: { zh: "\u274C \u627E\u4E0D\u5230\u4F1A\u8BDD \u201C{target}\u201D\u3002\u652F\u6301\uFF1A\u7F16\u53F7\uFF08/sessions \u91CC\u7684\u5E8F\u53F7\uFF09\u3001\u5B8C\u6574/\u5F00\u5934\u90E8\u5206 ID\u3001\u6807\u9898\u5173\u952E\u5B57\u3002", en: "\u274C No session \u201C{target}\u201D. Try: a number (from /sessions), a full/partial ID, or a title keyword." },
  useSwitched: { zh: "\u{1F500} \u5DF2\u5207\u6362\u5230\u4F1A\u8BDD {label}", en: "\u{1F500} Switched to session {label}" },
  permUnavailable: { zh: "\u274C \u6743\u9650\u670D\u52A1\u4E0D\u53EF\u7528\uFF08host \u672A\u6CE8\u5165 permissionPresets\uFF09\u3002", en: "\u274C Permission service unavailable (host did not inject permissionPresets)." },
  permDefault: { zh: "\u5F53\u524D\u9ED8\u8BA4\u9884\u8BBE: {p}\n\u53EF\u7528: {names}\n\u7528\u6CD5: /permission default <name>", en: "Current default: {p}\nAvailable: {names}\nUsage: /permission default <name>" },
  permUnknown: { zh: "\u274C \u672A\u77E5\u9884\u8BBE {name}\uFF08\u53EF\u7528: {names}\uFF09", en: "\u274C Unknown preset {name} (available: {names})" },
  permDefaultSet: { zh: "\u2705 \u9ED8\u8BA4\u9884\u8BBE\u5DF2\u8BBE\u4E3A {name}\uFF08\u5F71\u54CD\u65B0\u4F1A\u8BDD\uFF09", en: "\u2705 Default preset set to {name} (applies to new sessions)" },
  permNoSession: { zh: "\u274C \u627E\u4E0D\u5230\u5F53\u524D\u4F1A\u8BDD {sid} \u7684 Session \u5BF9\u8C61\uFF0C\u65E0\u6CD5\u5207\u6362\u6743\u9650\u3002", en: "\u274C No Session object for {sid}; cannot switch permission." },
  permSwitched: { zh: "\u2705 \u5DF2\u5207\u6362\u5230\u9884\u8BBE {name}", en: "\u2705 Switched to preset {name}" },
  permTitle: { zh: "\u{1F510} \u5F53\u524D\u9884\u8BBE: {p}\n\u4F1A\u8BDD: {label}\n\n\u70B9\u6309\u94AE\u5207\u6362\u6743\u9650\uFF1A", en: "\u{1F510} Current preset: {p}\nSession: {label}\n\nTap a button to switch:" },
  modelUsage: { zh: "\u7528\u6CD5: /model <\u7F16\u53F7>\uFF08\u7F16\u53F7\u89C1 /models\uFF09", en: "Usage: /model <num> (numbers from /models)" },
  modelNoNum: { zh: "\u274C \u6CA1\u6709\u7F16\u53F7 {target}\u3002\u7528 /models \u67E5\u770B\u3002", en: "\u274C No number {target}. See /models." },
  modelSwitched: { zh: "\u2705 \u5DF2\u5207\u6362\u5230\u6A21\u578B {name}\uFF08{provider}\uFF09{eff}", en: "\u2705 Switched to model {name} ({provider}){eff}" },
  modelSwitchedEff: { zh: "\uFF0C\u63A8\u7406\u5F3A\u5EA6 {eff}", en: ", reasoning effort {eff}" },
  modelFailed: { zh: "\u274C \u5207\u6362\u5931\u8D25: {err}", en: "\u274C Switch failed: {err}" },
  modelEffortPrompt: { zh: "\u{1F39B} \u8BF7\u9009\u62E9 {name} \u7684\u601D\u8003\u5F3A\u5EA6\uFF1A", en: "\u{1F39B} Pick the reasoning effort for {name}:" },
  modelsTitle: { zh: "\u{1F4DA} \u6A21\u578B\u5217\u8868\uFF08\u53D1 /model <\u7F16\u53F7> \u5207\u6362\u5F53\u524D\u4F1A\u8BDD\uFF09:", en: "\u{1F4DA} Models (send /model <num> to switch the current session):" },
  modelsCurrent: { zh: "\u5F53\u524D: {cur}", en: "Current: {cur}" },
  modelsEffort: { zh: "\n\u63A8\u7406\u5F3A\u5EA6: {eff}\uFF08/effort \u4FEE\u6539\uFF09", en: "\nReasoning effort: {eff} (use /effort)" },
  modelsCurrentMark: { zh: "\uFF08\u5F53\u524D\uFF09", en: " (current)" },
  renameUsage: { zh: "\u7528\u6CD5: /rename <\u65B0\u6807\u9898>\uFF08\u91CD\u547D\u540D\u5F53\u524D\u4F1A\u8BDD\uFF09", en: "Usage: /rename <title> (renames the current session)" },
  renameOk: { zh: "\u2705 \u5DF2\u91CD\u547D\u540D\u4E3A: {title}", en: "\u2705 Renamed to: {title}" },
  renameFailed: { zh: "\u274C \u91CD\u547D\u540D\u5931\u8D25: {err}", en: "\u274C Rename failed: {err}" },
  effortNoModel: { zh: "\u274C \u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D\u6A21\u578B\u4FE1\u606F\u3002", en: "\u274C Could not read the current model info." },
  effortUnset: { zh: "\u672A\u8BBE\u7F6E", en: "unset" },
  unknown: { zh: "\u672A\u77E5", en: "unknown" },
  effortNoSupport: { zh: "\u{1F9E0} \u5F53\u524D\u6A21\u578B: {model}\n\u63A8\u7406\u5F3A\u5EA6: {eff}\n\n\u8BE5\u6A21\u578B\u4E0D\u652F\u6301\u63A8\u7406\u5F3A\u5EA6\u8C03\u8282\u3002", en: "\u{1F9E0} Model: {model}\nEffort: {eff}\n\nThis model does not support reasoning effort." },
  effortTitle: { zh: "\u{1F9E0} \u5F53\u524D\u6A21\u578B: {model}\n\u5F53\u524D\u63A8\u7406\u5F3A\u5EA6: {eff}\n\n\u70B9\u6309\u94AE\u4FEE\u6539\uFF1A", en: "\u{1F9E0} Model: {model}\nCurrent effort: {eff}\n\nTap a button to adjust:" },
  effortReply: { zh: "\u2705 \u63A8\u7406\u5F3A\u5EA6\u5DF2\u8BBE\u4E3A {name}", en: "\u2705 Reasoning effort set to {name}" },
  restartDenied: { zh: "\u26D4 \u4EC5\u7BA1\u7406\u5458\u53EF\u6267\u884C /restart\u3002", en: "\u26D4 Admin only: /restart." },
  restartPending: { zh: "\u26A0\uFE0F \u91CD\u542F\u5DF2\u5728\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7A0D\u5019\uFF08\u82E5\u957F\u65F6\u95F4\u672A\u6062\u590D\u518D\u8BD5\uFF09\u3002", en: "\u26A0\uFE0F A restart is already in progress; please wait." },
  restarting: { zh: "\u{1F504} \u6B63\u5728\u91CD\u542F DSH web\u2026\uFF08\u7EA6 10 \u79D2\u540E\u81EA\u52A8\u6C47\u62A5\u72B6\u6001\uFF09", en: "\u{1F504} Restarting DSH web\u2026 (status report follows in ~10s)" },
  restartFailed: { zh: "\u274C \u91CD\u542F\u5931\u8D25: {err}", en: "\u274C Restart failed: {err}" },
  persistUnready: { zh: "\u274C \u8BBE\u7F6E\u670D\u52A1\u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF0C\u6216 /restart \u540E\u91CD\u8BD5\u3002", en: "\u274C Settings service not ready; retry shortly, or /restart." },
  persistFailed: { zh: "\u274C \u4FDD\u5B58\u6388\u6743\u5931\u8D25\uFF08\u914D\u7F6E\u53EA\u8BFB\uFF1F\uFF09: {err}", en: "\u274C Failed to save access config (read-only?): {err}" },
  adminOnly: { zh: "\u26D4 \u4EC5\u7BA1\u7406\u5458\u53EF\u6267\u884C {cmd}\u3002", en: "\u26D4 Admin only: {cmd}." },
  usersHeader: { zh: "\u{1F4CB} \u6388\u6743\u5217\u8868\uFF08{n}\uFF09:\n\n{list}\n\n/grant <chatId> \u6DFB\u52A0\n/revoke <chatId> \u79FB\u9664\n/admin [off] <chatId> \u8BBE\u7F6E/\u53D6\u6D88\u7BA1\u7406\u5458", en: "\u{1F4CB} Authorized ({n}):\n\n{list}\n\n/grant <chatId> add\n/revoke <chatId> remove\n/admin [off] <chatId> manage admins" },
  usersEmpty: { zh: "\uFF08\u7A7A\uFF09", en: "(empty)" },
  grantUsage: { zh: "\u7528\u6CD5: /grant <chatId>\uFF08\u7FA4\u91CC\u76F4\u63A5 /grant \u6388\u6743\u5F53\u524D\u7FA4\uFF09", en: "Usage: /grant <chatId> (in-group /grant grants the group)" },
  grantBadId: { zh: "\u274C \u65E0\u6CD5\u89E3\u6790 chatId: {target}", en: "\u274C Cannot parse chatId: {target}" },
  grantAlready: { zh: "\u2139\uFE0F {id} \u5DF2\u5728\u6388\u6743\u5217\u8868\u3002", en: "\u2139\uFE0F {id} is already authorized." },
  grantOk: { zh: "\u2705 \u5DF2\u6388\u6743 {id}{label}\uFF0C\u73B0\u5728\u53EF\u4EE5\u6B63\u5E38\u4F7F\u7528\u3002", en: "\u2705 Authorized {id}{label} \u2014 they can use the bot now." },
  grantOkLabel: { zh: "\uFF08{label}\uFF09", en: " ({label})" },
  revokeUsage: { zh: "\u7528\u6CD5: /revoke <chatId>", en: "Usage: /revoke <chatId>" },
  revokeSelf: { zh: "\u26D4 \u4E0D\u80FD\u79FB\u9664\u4F60\u81EA\u5DF1\uFF08\u4F1A\u5931\u53BB\u7BA1\u7406\u6743\u9650\uFF09\u3002", en: "\u26D4 Cannot remove yourself (would lose admin)." },
  revokeNotIn: { zh: "\u2139\uFE0F {id} \u4E0D\u5728\u6388\u6743\u5217\u8868\u3002", en: "\u2139\uFE0F {id} is not authorized." },
  revokeLastAdmin: { zh: "\u26D4 \u4E0D\u80FD\u79FB\u9664\u6700\u540E\u4E00\u4E2A\u7BA1\u7406\u5458\u3002", en: "\u26D4 Cannot remove the last admin." },
  revokeOk: { zh: "\u2705 \u5DF2\u79FB\u9664 {id}\u3002", en: "\u2705 Removed {id}." },
  adminUsage: { zh: "\u7528\u6CD5: /admin <chatId> \u6216 /admin off <chatId>", en: "Usage: /admin <chatId> or /admin off <chatId>" },
  adminSelf: { zh: "\u26D4 \u4E0D\u80FD\u53D6\u6D88\u81EA\u5DF1\u7684\u7BA1\u7406\u5458\u3002", en: "\u26D4 Cannot un-admin yourself." },
  adminNotAdmin: { zh: "\u2139\uFE0F {id} \u4E0D\u662F\u7BA1\u7406\u5458\u3002", en: "\u2139\uFE0F {id} is not an admin." },
  adminLastAdmin: { zh: "\u26D4 \u4E0D\u80FD\u79FB\u9664\u6700\u540E\u4E00\u4E2A\u7BA1\u7406\u5458\u3002", en: "\u26D4 Cannot remove the last admin." },
  adminAlready: { zh: "\u2139\uFE0F {id} \u5DF2\u662F\u7BA1\u7406\u5458\u3002", en: "\u2139\uFE0F {id} is already an admin." },
  adminOk: { zh: "\u2705 {id} \u73B0\u5728\u662F\u7BA1\u7406\u5458\uFF08\u5DF2\u81EA\u52A8\u6388\u6743\uFF09\u3002", en: "\u2705 {id} is now an admin (auto-authorized)." },
  adminOffOk: { zh: "\u2705 \u5DF2\u53D6\u6D88 {id} \u7684\u7BA1\u7406\u5458\u3002", en: "\u2705 Removed admin from {id}." },
  approvalTitle: { zh: "\u{1F510} \u9700\u8981\u6388\u6743\n\u{1F6E0} \u5DE5\u5177: {tool}\n\u{1F4CB} \u539F\u56E0: {reason}\n\n\u8BF7\u9009\u62E9\uFF1A", en: "\u{1F510} Approval needed\n\u{1F6E0} Tool: {tool}\n\u{1F4CB} Reason: {reason}\n\nChoose:" },
  noReason: { zh: "\u65E0\u8BF4\u660E", en: "no reason given" },
  allowOnce: { zh: "\u2705 \u5141\u8BB8\u4E00\u6B21", en: "\u2705 Allow once" },
  reject: { zh: "\u274C \u62D2\u7EDD", en: "\u274C Reject" },
  deniedQuestion: { zh: "\u26A0\uFE0F \u53EA\u6709\u63D0\u95EE\u8005\u53EF\u4EE5\u56DE\u7B54\u672C\u9898", en: "\u26A0\uFE0F Only the asker can answer this" },
  deniedApproval: { zh: "\u26A0\uFE0F \u53EA\u6709\u53D1\u8D77\u8BE5\u6388\u6743\u7684\u7528\u6237\u624D\u80FD\u64CD\u4F5C", en: "\u26A0\uFE0F Only the requester can act on this" },
  submitted: { zh: "\u2705 \u5DF2\u63D0\u4EA4", en: "\u2705 Submitted" },
  deniedChat: { zh: "\u26D4 \u672A\u6388\u6743", en: "\u26D4 Not authorized" },
  choiceExpired: { zh: "\u26A0\uFE0F \u8BE5\u9009\u62E9\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0 /model \u5207\u6362\u3002", en: "\u26A0\uFE0F That choice has expired; run /model again." },
  permReply: { zh: "\u2705 \u5DF2\u5207\u6362\u5230\u6743\u9650 {name}", en: "\u2705 Switched to permission {name}" },
  stOnline: { zh: "\u5728\u7EBF \u2705", en: "Online \u2705" },
  stSession: { zh: "\u4F1A\u8BDD: {label}", en: "Session: {label}" },
  stModel: { zh: "\u{1F4DA} \u6A21\u578B: {m}", en: "\u{1F4DA} Model: {m}" },
  stMode: { zh: "\u{1F39B} \u6A21\u5F0F: {m}", en: "\u{1F39B} Mode: {m}" },
  stLoad: { zh: "\u8D1F\u8F7D: {load}", en: "Load: {load}" },
  stTokens: { zh: "\u{1F4CA} Token", en: "\u{1F4CA} Tokens" },
  stInput: { zh: "\u8F93\u5165: {v}", en: "Input: {v}" },
  stOutput: { zh: "\u8F93\u51FA: {v}", en: "Output: {v}" },
  stCacheRead: { zh: "\u7F13\u5B58\u8BFB: {v}", en: "Cache read: {v}" },
  stCacheWrite: { zh: "\u7F13\u5B58\u5199: {v}", en: "Cache write: {v}" },
  stContext: { zh: "\u{1F9E0} \u4E0A\u4E0B\u6587 {pct}% ({used} / {total})", en: "\u{1F9E0} Context {pct}% ({used} / {total})" },
  stContextDetail: { zh: "  \u7CFB\u7EDF {s} \xB7 \u5DE5\u5177 {t} \xB7 \u6D88\u606F {m}", en: "  system {s} \xB7 tools {t} \xB7 messages {m}" },
  stTurns: { zh: "\u{1F4C8} \u56DE\u5408: {t} \xB7 \u6D88\u606F: {m}", en: "\u{1F4C8} Turns: {t} \xB7 Messages: {m}" },
  stNoSession: { zh: "\uFF08\u672A\u521B\u5EFA\uFF09", en: "(not created)" },
  groupCmdDenied: { zh: "\u{1F512} \u7FA4\u7EC4\u91CC\u53EA\u652F\u6301\u63D0\u95EE\u548C\u67E5\u770B\u72B6\u6001\u3002\u8BF7\u79C1\u804A\u4F7F\u7528 {cmd}\u3002", en: "\u{1F512} Groups only support asking questions and viewing status. Use {cmd} in a private chat." }
};
function ts() {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function loadLabel() {
  try {
    if (process.platform === "win32") return "\u2014";
    const v = loadavg()[0];
    return Math.round(v * 100) / 100;
  } catch {
    return "\u2014";
  }
}
function fmtTokens(n) {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}
function fmtMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0";
  const s = Math.round(ms / 1e3);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
  return `${Math.floor(s / 3600)}h${Math.floor(s % 3600 / 60)}m`;
}
function quotedTextOf(msg) {
  const q = msg?.reply_to_message;
  if (!q) return "";
  const qtext = (q.text ?? q.caption ?? "").trim();
  if (qtext) return qtext;
  if (q.sticker) return "[\u8D34\u7EB8]";
  if (q.photo || q.video || q.animation || q.document) return "[\u5A92\u4F53\u6587\u4EF6]";
  if (q.voice || q.audio) return "[\u8BED\u97F3]";
  if (q.location) return "[\u4F4D\u7F6E]";
  if (q.poll) return "[\u6295\u7968]";
  return "";
}
function stdoutTarget() {
  if (process.platform !== "linux") return dshHomeLogPath;
  try {
    const target = readlinkSync("/proc/self/fd/1");
    if (target.startsWith("/") && target !== "/dev/null") return target;
  } catch {
  }
  return dshHomeLogPath;
}
var Bridge = class {
  constructor(config) {
    this.config = config;
    this.chats = /* @__PURE__ */ new Set([...(config.allowedUsers ?? []).map((u) => String(u.chatId))]);
    if (config.allowedChat && config.allowedChat !== "") this.chats.add(String(config.allowedChat));
    this.adminChats = new Set((config.adminChatIds ?? []).map((c) => String(c)));
    this.chatToLabel = new Map((config.allowedUsers ?? []).map((u) => [String(u.chatId), u.label ?? String(u.chatId)]));
    this.tg = createTelegramClient({
      tgApiBase: config.tgApiBase,
      botToken: config.botToken,
      timeoutMs: config.tgTimeoutMs
    });
    this.permissionPresets = null;
    this.sessionService = null;
    this.state = {
      offset: 0,
      sessionId: null,
      // legacy field, kept for migration
      lastTurnEndSeq: 0,
      perUserSessions: {},
      // chatId -> { sessions, current }
      chatLangs: {}
      // chatId -> last seen from.language_code (survives restarts)
    };
    this.pendingApprovals = /* @__PURE__ */ new Map();
    this.pendingQuestions = /* @__PURE__ */ new Map();
    this.updateQueue = [];
    this.queueBusy = false;
    this.mux = null;
    this.pollAbort = new AbortController();
    this.chatState = /* @__PURE__ */ new Map();
    this.pendingReplies = /* @__PURE__ */ new Map();
    this.permissionReply = void 0;
    this.effortReply = void 0;
    this.newmodeReply = void 0;
    this.effoptReply = void 0;
    this.pendingEffortChoice = /* @__PURE__ */ new Map();
    this.stopped = false;
    this.load();
    if (this.state.sessionId) {
      const legacyChat = [...this.chats][0];
      if (legacyChat && !this.state.perUserSessions[legacyChat]) {
        this.state.perUserSessions[legacyChat] = { sessions: [this.state.sessionId], current: this.state.sessionId };
        this.save();
        this.log("migrated legacy session", this.state.sessionId, "to chat", legacyChat);
      }
    }
  }
  /** Attach host services (permission presets + session store) from the plugin entry. */
  attachHost({ permissionPresets, sessionService, settingsService } = {}) {
    if (permissionPresets !== void 0) this.permissionPresets = permissionPresets;
    if (sessionService !== void 0) this.sessionService = sessionService;
    if (settingsService != null) this.settingsService = settingsService;
  }
  /**
  * Apply access-related config to a running bridge in place: authorized chats,
  * admin chats, labels, and the askerRequired switch. No rebuild, so there is
  * no getUpdates 409 window and no loss of in-flight turn state. Called by the
  * entry when a settings change touches only these fields, and by the TG admin
  * commands right after they persist to settings. Missing fields fall back to
  * the current config, so partial updates (e.g. only allowedUsers from a TG
  * command) can never wipe the admin list.
  */
  applyAccessConfig(cfg) {
    this.config = { ...this.config, ...cfg };
    const allowedUsers = cfg.allowedUsers ?? this.config.allowedUsers ?? [];
    const allowedChat = cfg.allowedChat ?? this.config.allowedChat ?? "";
    const adminChatIds = cfg.adminChatIds ?? this.config.adminChatIds ?? [];
    const chats = new Set(allowedUsers.map((u) => String(u.chatId)));
    if (allowedChat && allowedChat !== "") chats.add(String(allowedChat));
    this.chats = chats;
    this.adminChats = new Set(adminChatIds.map((c) => String(c)));
    this.chatToLabel = new Map(allowedUsers.map((u) => [String(u.chatId), u.label ?? String(u.chatId)]));
    this.log("access config applied: chats=", [...chats], "admins=", [...this.adminChats]);
  }
  log(...a) {
    console.log(ts(), "[tg-bridge]", ...a);
  }
  /** Chat language: "en" for English clients, "zh" otherwise. The per-chat
  *  language is persisted (state.chatLangs), so even a fresh process after
  *  /restart replies in the user's language before any new message arrives. */
  lang(chat) {
    const key = String(chat);
    const code = this.runtime(chat).language ?? this.state.chatLangs?.[key];
    const l = String(code ?? "").toLowerCase();
    return l.startsWith("en") ? "en" : "zh";
  }
  /** Localized UI string for a chat, with {var} substitution. */
  t(chat, key, vars = {}) {
    const entry = I18N[key];
    if (!entry) return key;
    let s = entry[this.lang(chat)];
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  }
  // ---------- state persistence ----------
  save() {
    try {
      writeFileSync(this.config.stateFile, JSON.stringify({
        ...this.state,
        pQuestions: [...this.pendingQuestions.entries()],
        pApprovals: [...this.pendingApprovals.entries()]
      }));
    } catch (e) {
      this.log("state save failed:", e.message);
    }
  }
  load() {
    try {
      const j = JSON.parse(readFileSync(this.config.stateFile, "utf8"));
      const pQuestions = j.pQuestions ?? [];
      const pApprovals = j.pApprovals ?? [];
      delete j.pQuestions;
      delete j.pApprovals;
      Object.assign(this.state, j);
      for (const [k, v] of pQuestions) this.pendingQuestions.set(k, v);
      for (const [k, v] of pApprovals) this.pendingApprovals.set(k, v);
    } catch (e) {
      this.log("state load failed:", e.message);
    }
  }
  // ---------- DSH client API ----------
  async dsh(method, payload) {
    const doFetch = () => fetch(`${this.config.dshBaseUrl}/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId: randomUUID(), method, payload }),
      signal: AbortSignal.timeout(this.config.dshTimeoutMs)
    });
    try {
      const res = await doFetch();
      const j = await res.json();
      if (!j.result?.ok) throw new Error(`${method}: ${JSON.stringify(j.result?.error ?? j)}`);
      return j.result.value;
    } catch (e) {
      if (e?.name === "AbortError" || !/fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(String(e?.message))) throw e;
      const res = await doFetch();
      const j = await res.json();
      if (!j.result?.ok) throw new Error(`${method}: ${JSON.stringify(j.result?.error ?? j)}`);
      return j.result.value;
    }
  }
  async dshRespond(rpcId, value) {
    const res = await fetch(`${this.config.dshBaseUrl}/api/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-response", rpcId, result: { ok: true, value } }),
      signal: AbortSignal.timeout(this.config.dshTimeoutMs)
    });
    const j = await res.json();
    if (!j.accepted) throw new Error(`respond ${rpcId}: ${j.reason}`);
    return j;
  }
  /** Whether a chat is allowed to talk to this bot. */
  isAllowed(chat) {
    return this.chats.has(String(chat));
  }
  /** Whether a chat is an administrator (sees/uses every user's sessions). */
  isAdmin(chat) {
    return this.adminChats.has(String(chat));
  }
  /**
  * Whether a message in this chat should be acted on. Private chats: always.
  * Groups/supergroups (negative chat id): only when the bot is mentioned
  * (@bot) or the message replies to the bot's own message — never the bot's
  * own echoes.
  */
  shouldHandleMessage(msg) {
    if (!msg) return false;
    if (msg.from?.is_bot) return false;
    const chatType = msg.chat?.type;
    const isGroup = chatType === "group" || chatType === "supergroup" || String(msg.chat?.id).startsWith("-");
    if (!isGroup) return true;
    const myId = this.tg?.myId;
    if (msg.reply_to_message?.from?.is_bot) return true;
    const entities = msg.entities ?? [];
    for (const e of entities) {
      if (e.type === "mention" && e.offset === 0) return true;
      if (e.type === "bot_command" && e.offset === 0) return true;
    }
    if (myId && msg.text?.includes(`@${myId}`)) return true;
    return false;
  }
  /** Get (or create) the per-chat session bookkeeping entry. */
  chatEntry(chat) {
    const key = String(chat);
    if (!this.state.perUserSessions[key]) this.state.perUserSessions[key] = { sessions: [], current: null };
    return this.state.perUserSessions[key];
  }
  /** Resolve the session id a chat should use (its own current, or fresh). */
  async ensureSession(chat) {
    const entry = this.chatEntry(chat);
    if (entry.current) return entry.current;
    const display = await this.chatDisplayName(String(chat)) ?? this.chatToLabel.get(String(chat)) ?? chat;
    const created = await this.dsh("session.create", { title: `TG ${display}` });
    entry.current = created.sessionId;
    if (!entry.sessions.includes(created.sessionId)) entry.sessions.push(created.sessionId);
    this.runtime(chat).lastTurnEndSeq = 0;
    this.save();
    this.log("created session", created.sessionId, "for chat", chat);
    return created.sessionId;
  }
  // ---------- sending ----------
  // Chunk on line boundaries so ``` blocks are never split mid-way.
  splitText(s, n = MESSAGE_LIMIT) {
    if (s.length <= n) return [s];
    const out = [];
    let cur = "";
    for (const line of s.split("\n")) {
      if (cur && cur.length + line.length + 1 > n) {
        out.push(cur);
        cur = line;
      } else cur = cur ? cur + "\n" + line : line;
      while (cur.length > n) {
        out.push(cur.slice(0, n));
        cur = cur.slice(n);
      }
    }
    if (cur) out.push(cur);
    return out;
  }
  async send(chat, text) {
    const chunks = this.splitText(formatForTelegram(text));
    for (const c of chunks) {
      try {
        const r = await this.tg.call("sendMessage", {
          chat_id: chat,
          text: c,
          parse_mode: "MarkdownV2",
          disable_web_page_preview: true
        });
        this.log("sent md msg_id", r.message_id);
      } catch (e) {
        this.log("markdown rejected, plain fallback:", e.message);
        const r = await this.tg.call("sendMessage", {
          chat_id: chat,
          text: c.replace(unescapeMarkdownV2, "$1"),
          disable_web_page_preview: true
        });
        this.log("sent plain msg_id", r.message_id);
      }
    }
  }
  // ---------- typing indicator ----------
  /** Per-chat runtime state bag. */
  runtime(chat) {
    const key = String(chat);
    let r = this.chatState.get(key);
    if (!r) {
      r = { typingTimer: null, finalText: null, sentText: false, progressMsgId: null, toolLog: [], lastTurnEndSeq: 0 };
      this.chatState.set(key, r);
    }
    return r;
  }
  startTyping(chat) {
    const r = this.runtime(chat);
    this.stopTyping(chat);
    const fire = async () => {
      try {
        await this.tg.call("sendChatAction", { chat_id: chat, action: "typing" });
      } catch {
      }
    };
    fire();
    r.typingTimer = setInterval(fire, 4e3);
  }
  stopTyping(chat) {
    const r = this.runtime(chat);
    if (r.typingTimer) {
      clearInterval(r.typingTimer);
      r.typingTimer = null;
    }
  }
  // ---------- mux WebSocket ----------
  connectMux() {
    if (this.stopped) return;
    const ws = new WebSocket(this.config.muxUrl);
    this.mux = ws;
    ws.onopen = () => this.log("mux connected");
    ws.onmessage = (ev) => {
      try {
        this.handleMuxFrame(JSON.parse(ev.data));
      } catch (e) {
        this.log("mux frame err:", e.message);
      }
    };
    ws.onclose = () => {
      this.log("mux closed, reconnecting in 3s");
      if (!this.stopped) setTimeout(() => this.connectMux(), 3e3);
    };
    ws.onerror = () => {
    };
  }
  /** Resolve which chat owns a session id (reverse of perUserSessions). */
  chatForSession(sid) {
    if (!sid) return null;
    for (const [chat, entry] of Object.entries(this.state.perUserSessions ?? {})) {
      if (entry.sessions?.includes(sid) || entry.current === sid) return chat;
    }
    return null;
  }
  async handleMuxFrame(full) {
    if (!full || full.type !== "server-request") return;
    const p = full.payload ?? {};
    const sid = p.sessionId;
    if (sid && this.chatForSession(sid) === null) return;
    const chat = sid ? this.chatForSession(sid) : [...this.chats][0];
    if (!chat) return;
    const r = this.runtime(chat);
    try {
      switch (p.type) {
        case "approval/requested": {
          if (sid === void 0 || (this.pendingReplies.get(sid) ?? 0) <= 0) break;
          this.log("approval requested:", p.approvalId, "|", (p.reason ?? "").slice(0, 60));
          const msg = await this.tg.call("sendMessage", {
            chat_id: chat,
            text: this.t(chat, "approvalTitle", { tool: p.toolName, reason: p.reason ?? this.t(chat, "noReason") }),
            reply_markup: JSON.stringify({ inline_keyboard: [[
              { text: this.t(chat, "allowOnce"), callback_data: "allow" },
              { text: this.t(chat, "reject"), callback_data: "reject" }
            ]] })
          });
          this.pendingApprovals.set(full.rpcId, { approvalId: p.approvalId, sessionId: p.sessionId, tgMsgId: msg.message_id, chatId: chat, askerId: r.askerId });
          this.save();
          break;
        }
        case "question/requested": {
          if (sid === void 0 || (this.pendingReplies.get(sid) ?? 0) <= 0) break;
          const q = p.questions?.[0];
          if (!q) break;
          this.log("question requested:", q.question.slice(0, 60));
          const opts = (q.options ?? []).map((o, i) => ({ text: o.label, callback_data: `q:${i}` }));
          const msg = await this.tg.call("sendMessage", {
            chat_id: chat,
            text: `\u2753 ${q.question}`,
            reply_markup: JSON.stringify({ inline_keyboard: opts.length ? [opts] : [] })
          });
          this.pendingQuestions.set(full.rpcId, { sessionId: p.sessionId, tgMsgId: msg.message_id, questions: p.questions, chatId: chat, askerId: r.askerId });
          this.save();
          break;
        }
        case "session/event": {
          const ev = p.event ?? {};
          const ours = sid !== void 0 && (this.pendingReplies.get(sid) ?? 0) > 0;
          switch (ev.type) {
            case "turn/start":
              if (ours) {
                r.finalText = null;
                r.sentText = false;
                r.toolLog.length = 0;
                r.progressMsgId = null;
                this.startTyping(chat);
              }
              break;
            case "turn/end":
              this.stopTyping(chat);
              this.state.lastTurnEndSeq = ev.seq ?? this.state.lastTurnEndSeq;
              r.lastTurnEndSeq = ev.seq ?? r.lastTurnEndSeq;
              if (sid !== void 0) {
                const left = (this.pendingReplies.get(sid) ?? 1) - 1;
                if (left <= 0) this.pendingReplies.delete(sid);
                else this.pendingReplies.set(sid, left);
              }
              this.save();
              if (!ours) break;
              try {
                if (!r.sentText) {
                  this.log("no text via mux, fallback reply");
                  await this.fallbackReply(chat);
                }
              } finally {
                if (r.progressMsgId) {
                  try {
                    await this.tg.call("deleteMessage", { chat_id: chat, message_id: r.progressMsgId });
                  } catch {
                  }
                  r.progressMsgId = null;
                }
              }
              break;
            case "tool/call": {
              if (!ours) break;
              const name2 = ev.data?.name ?? "?";
              const a = ev.data?.arguments;
              let args = "";
              try {
                args = typeof a === "string" ? a : JSON.stringify(a ?? {});
              } catch {
                args = String(a ?? "");
              }
              args = args.replace(/\s+/g, " ").slice(0, 60);
              r.toolLog.push(`${name2} ${args}`);
              if (r.toolLog.length > 3) r.toolLog.shift();
              const line = "\u{1F6E0} " + r.toolLog.join("\n");
              try {
                if (r.progressMsgId) await this.tg.call("editMessageText", { chat_id: chat, message_id: r.progressMsgId, text: line });
                else {
                  const m = await this.tg.call("sendMessage", { chat_id: chat, text: line });
                  r.progressMsgId = m.message_id;
                }
              } catch {
              }
              break;
            }
            case "assistant/message": {
              if (!ours) break;
              const c = ev.data?.message?.content ?? [];
              const txt = c.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
              if (txt) {
                r.finalText = txt;
                r.sentText = true;
                this.log("sending text via mux, len", txt.length);
                await this.send(chat, txt);
              }
              break;
            }
          }
          break;
        }
      }
    } catch (e) {
      this.log("mux handler err:", e.message);
    }
  }
  async fallbackReply(chat) {
    try {
      const entry = this.chatEntry(chat);
      const sid = entry.current;
      if (!sid) return;
      const { events } = await this.dsh("session.history", { sessionId: sid });
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i].event ?? events[i];
        if (ev.type === "assistant/message") {
          const c = ev.data?.message?.content ?? [];
          const hasTool = c.some((b) => b.type === "tool-call");
          const txt = c.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
          if (txt && !hasTool) {
            await this.send(chat, txt);
            return;
          }
        }
        if (ev.type === "turn/start") return;
      }
    } catch (e) {
      this.log("fallback reply err:", e.message);
    }
  }
  // ---------- session management (TG commands) ----------
  async listSessions() {
    const { items } = await this.dsh("session.list", {});
    return items ?? [];
  }
  /** Resolve a session's display label: "title (session-xxx)" or the bare id. */
  async sessionLabel(sid) {
    let title = "";
    try {
      const { items } = await this.dsh("session.list", {});
      const found = items?.find((s) => s.sessionId === sid);
      title = found?.projections?.values?.title ?? "";
    } catch {
    }
    return title && title !== "" ? `${title} (${sid})` : sid;
  }
  /** Sessions a chat may see: its own, or every session when admin. */
  visibleSessionsFor(chat) {
    const entry = this.chatEntry(chat);
    const own = entry.sessions ?? [];
    if (!this.isAdmin(chat)) return { ids: own, all: false };
    return { ids: null, all: true };
  }
  async handleSessionsCommand(chat) {
    const { ids, all } = this.visibleSessionsFor(chat);
    const items = await this.listSessions();
    const visible = all ? items : items.filter((s) => ids.includes(s.sessionId));
    if (visible.length === 0) {
      await this.send(chat, this.t(chat, "noSessions"));
      return;
    }
    const entry = this.chatEntry(chat);
    const current = entry.current;
    const ownerBySession = /* @__PURE__ */ new Map();
    if (all) {
      for (const [chatId, e] of Object.entries(this.state.perUserSessions ?? {})) {
        for (const sid of e.sessions ?? []) ownerBySession.set(sid, chatId);
      }
    }
    const presetName = new Map((await this.dsh("agentPreset.list", {}).catch(() => null))?.presets?.map((p) => [p.id, p.name ?? p.id]) ?? []);
    const lines = visible.map((s, i) => {
      const mark = s.sessionId === current ? "\u2705" : `${i + 1}`;
      const run = s.running ? " \u{1F504}" : "";
      const blank = s.blank ? " (\u7A7A)" : "";
      const title = s.projections?.values?.title;
      const label = title && title !== "" ? title : s.sessionId.slice(0, 20);
      const preset = s.agentPreset ? `[${this.lang(chat) === "zh" ? presetName.get(s.agentPreset) ?? s.agentPreset : s.agentPreset}]` : "";
      let src = "";
      if (all) {
        const owner2 = ownerBySession.get(s.sessionId);
        src = owner2 ? this.t(chat, "srcTg", { label: this.chatToLabel.get(owner2) ?? owner2 }) : this.t(chat, "srcWeb");
      }
      return `${mark}. ${label}${run}${blank}${preset}${src ? " " + src : ""}
   ${s.sessionId}`;
    });
    const owner = all ? this.t(chat, "sessionsOwner") : "";
    await this.send(chat, `${this.t(chat, "sessionsHeader", { n: visible.length, owner })}

${lines.join("\n")}

${this.t(chat, "sessionsHint")}`);
  }
  async handleUseCommand(chat, arg) {
    const target = String(arg ?? "").trim();
    const entry = this.chatEntry(chat);
    if (target === "" || target === "new") {
      const presetsRes = await this.dsh("agentPreset.list", {}).catch(() => null);
      const presets = presetsRes?.presets ?? [];
      if (presets.length === 0) {
        entry.current = null;
        this.save();
        const sid = await this.ensureSession(chat);
        await this.send(chat, this.t(chat, "useCreated", { sid }));
        return;
      }
      const keyboard = presets.map((p) => [{
        text: this.presetLabel(chat, p),
        callback_data: `newmode:${p.id}`
      }]);
      await this.tg.call("sendMessage", {
        chat_id: chat,
        text: this.t(chat, "useNewPickMode"),
        reply_markup: JSON.stringify({ inline_keyboard: keyboard })
      });
      return;
    }
    const { ids, all } = this.visibleSessionsFor(chat);
    const items = await this.listSessions();
    const visible = all ? items : items.filter((s) => ids.includes(s.sessionId));
    let found = null;
    if (/^\d+$/.test(target)) {
      const idx = parseInt(target, 10) - 1;
      found = visible[idx] ?? null;
    } else {
      const t = target.toLowerCase();
      const matches = visible.filter((s) => {
        const title = (s.projections?.values?.title ?? "").toLowerCase();
        return s.sessionId === target || s.sessionId.toLowerCase().startsWith(t) || title !== "" && title.includes(t);
      });
      if (matches.length === 1) found = matches[0];
      else if (matches.length > 1) {
        const lines = matches.map((s) => {
          const i = visible.indexOf(s) + 1;
          const title = s.projections?.values?.title;
          const label2 = title && title !== "" ? title : s.sessionId.slice(0, 20);
          return `${i}. ${label2}
   ${s.sessionId}`;
        });
        await this.send(chat, this.t(chat, "useAmbiguous", { target, n: matches.length, list: lines.join("\n") }));
        return;
      }
    }
    if (!found) {
      await this.send(chat, this.t(chat, "useNotFound", { target }));
      return;
    }
    entry.current = found.sessionId;
    this.state.lastTurnEndSeq = 0;
    this.runtime(chat).lastTurnEndSeq = 0;
    this.save();
    const label = await this.sessionLabel(found.sessionId);
    await this.send(chat, this.t(chat, "useSwitched", { label }));
  }
  // ---------- permission management (TG commands) ----------
  async handlePermissionCommand(chat, arg) {
    if (!this.permissionPresets) {
      await this.send(chat, this.t(chat, "permUnavailable"));
      return;
    }
    const names = this.permissionPresets.names;
    const raw = String(arg ?? "").trim();
    if (raw.startsWith("default")) {
      const name2 = raw.slice("default".length).trim();
      if (!name2) {
        await this.send(chat, this.t(chat, "permDefault", { p: this.permissionPresets.defaultPreset ?? "?", names: names.join(", ") }));
        return;
      }
      if (!names.includes(name2)) {
        await this.send(chat, this.t(chat, "permUnknown", { name: name2, names: names.join(", ") }));
        return;
      }
      await this.dsh("settings.update", { ns: "permission", patch: { defaultPreset: name2 } });
      await this.send(chat, this.t(chat, "permDefaultSet", { name: name2 }));
      return;
    }
    const entry = this.chatEntry(chat);
    const sid = entry.current ?? await this.ensureSession(chat);
    const session = this.sessionService?.get(sid);
    if (!session) {
      await this.send(chat, this.t(chat, "permNoSession", { sid }));
      return;
    }
    if (!raw) {
      const current = this.permissionPresets.current(session.events);
      const keyboard = names.map((name2) => [{
        text: (name2 === current ? "\u2705 " : "") + name2,
        callback_data: `perm:${name2}`
      }]);
      let label = sid;
      try {
        const { items } = await this.dsh("session.list", {});
        const found = items?.find((s) => s.sessionId === sid);
        const title = found?.projections?.values?.title;
        if (title && title !== "") label = title;
      } catch {
      }
      await this.tg.call("sendMessage", {
        chat_id: chat,
        text: this.t(chat, "permTitle", { p: current, label }),
        reply_markup: JSON.stringify({ inline_keyboard: keyboard })
      });
      return;
    }
    if (!names.includes(raw)) {
      await this.send(chat, this.t(chat, "permUnknown", { name: raw, names: names.join(", ") }));
      return;
    }
    this.permissionPresets.set(session, raw);
    await this.send(chat, this.t(chat, "permSwitched", { name: raw }));
  }
  // ---------- model management (TG commands) ----------
  /** Flat numbered model list across every provider group, with the current selection. */
  async handleModelsCommand(chat) {
    const sid = this.chatEntry(chat).current ?? await this.ensureSession(chat);
    const [catalog, sessionInfo] = await Promise.all([
      this.dsh("llm.models", {}),
      this.dsh("session.models", { sessionId: sid }).catch(() => null)
    ]);
    const groups = catalog?.groups ?? [];
    const current = sessionInfo?.current;
    let n = 0;
    const lines = [this.t(chat, "modelsTitle")];
    for (const g of groups) {
      lines.push(`
\u258E${g.name ?? g.id}`);
      for (const m of g.models ?? []) {
        n++;
        const isCur = current && current.provider === g.id && current.model === m.id;
        lines.push(`${isCur ? "\u2705 " : ""}${n}. ${m.name ?? m.id}${isCur ? this.t(chat, "modelsCurrentMark") : ""}`);
      }
    }
    const curText = current ? `${current.provider}/${current.model}` : this.t(chat, "unknown");
    const effText = current?.reasoningEffort ? this.t(chat, "modelsEffort", { eff: current.reasoningEffort }) : "";
    lines.push(`
${this.t(chat, "modelsCurrent", { cur: curText })}${effText}`);
    await this.send(chat, lines.join("\n"));
  }
  /** Switch the current session's model by flat catalog number. */
  async handleModelCommand(chat, arg, fromId) {
    const target = String(arg ?? "").trim();
    if (!/^\d+$/.test(target)) {
      await this.send(chat, this.t(chat, "modelUsage"));
      return;
    }
    const idx = parseInt(target, 10) - 1;
    const catalog = await this.dsh("llm.models", {});
    const groups = catalog?.groups ?? [];
    let n = 0;
    let hit = null;
    outer:
      for (const g of groups) {
        for (const m of g.models ?? []) {
          if (n === idx) {
            hit = { provider: g.id, model: m.id, name: m.name ?? m.id, reasoning: m.reasoning };
            break outer;
          }
          n++;
        }
      }
    if (!hit) {
      await this.send(chat, this.t(chat, "modelNoNum", { target }));
      return;
    }
    const sid = this.chatEntry(chat).current ?? await this.ensureSession(chat);
    try {
      const current = (await this.dsh("session.models", { sessionId: sid }).catch(() => null))?.current;
      const curEff = current?.reasoningEffort;
      const supportedEfforts = hit.reasoning?.efforts ?? [];
      if (supportedEfforts.length === 0) {
        const text = await this.performModelSwitch(chat, sid, hit, void 0);
        await this.send(chat, text);
        return;
      }
      const rpcId = randomUUID();
      const choice = { chatId: chat, clickerId: fromId, sessionId: sid, provider: hit.provider, model: hit.model, name: hit.name, efforts: supportedEfforts };
      this.pendingEffortChoice.set(rpcId, choice);
      const buttons = supportedEfforts.map((e) => [{
        text: (e.id === curEff ? "\u2705 " : "") + e.id,
        callback_data: `effopt:${rpcId}:${e.id}`
      }]);
      await this.tg.call("sendMessage", {
        chat_id: chat,
        text: this.t(chat, "modelEffortPrompt", { name: hit.name }),
        reply_markup: JSON.stringify({ inline_keyboard: buttons })
      });
    } catch (e) {
      await this.send(chat, this.t(chat, "modelFailed", { err: e.message }));
    }
  }
  /** Perform the actual selectModel switch; returns the confirmation text. */
  async performModelSwitch(chat, sid, hit, effort) {
    const payload = { sessionId: sid, provider: hit.provider, model: hit.model };
    if (effort) payload.reasoningEffort = effort;
    try {
      const res = await this.dsh("session.selectModel", payload);
      const eff = res?.selected?.reasoningEffort;
      const effText = eff ? this.t(chat, "modelSwitchedEff", { eff }) : "";
      return this.t(chat, "modelSwitched", { name: hit.name, provider: hit.provider, eff: effText });
    } catch (e) {
      return this.t(chat, "modelFailed", { err: e.message });
    }
  }
  /** Display label for an agent preset: English users see the id (standard,
  *  cordis...), Chinese users see the configured name (标准模式...). */
  presetLabel(chat, preset) {
    if (!preset) return "";
    return this.lang(chat) === "en" ? preset.id : preset.name ?? preset.id;
  }
  /** Create a new session with an explicit agent preset and switch to it. */
  async createSessionWithPreset(chat, presetId) {
    const entry = this.chatEntry(chat);
    const display = await this.chatDisplayName(String(chat)) ?? this.chatToLabel.get(String(chat)) ?? chat;
    const created = await this.dsh("session.create", { title: `TG ${display}`, agentPreset: presetId });
    entry.current = created.sessionId;
    if (!entry.sessions.includes(created.sessionId)) entry.sessions.push(created.sessionId);
    this.state.lastTurnEndSeq = 0;
    this.runtime(chat).lastTurnEndSeq = 0;
    this.save();
    this.log("created session", created.sessionId, "preset", presetId, "for chat", chat);
    return created.sessionId;
  }
  /** Rename the current session. */
  async handleRenameCommand(chat, arg) {
    const raw = String(arg ?? "").trim();
    if (!raw) {
      await this.send(chat, this.t(chat, "renameUsage"));
      return;
    }
    const sid = this.chatEntry(chat).current ?? await this.ensureSession(chat);
    try {
      const res = await this.dsh("session.rename", { sessionId: sid, title: raw });
      await this.send(chat, this.t(chat, "renameOk", { title: res.title ?? raw }));
    } catch (e) {
      await this.send(chat, this.t(chat, "renameFailed", { err: e.message }));
    }
  }
  /** Show the current reasoning effort as buttons. */
  async handleEffortCommand(chat) {
    const sid = this.chatEntry(chat).current ?? await this.ensureSession(chat);
    const sessionInfo = await this.dsh("session.models", { sessionId: sid }).catch(() => null);
    const current = sessionInfo?.current;
    if (!current) {
      await this.send(chat, this.t(chat, "effortNoModel"));
      return;
    }
    const catalog = await this.dsh("llm.models", {});
    const group = (catalog?.groups ?? []).find((g) => g.id === current.provider);
    const model = (group?.models ?? []).find((m) => m.id === current.model);
    const efforts = (model?.reasoning?.efforts ?? []).map((e) => e.id);
    const effText = current.reasoningEffort ?? this.t(chat, "effortUnset");
    if (!efforts.length) {
      await this.send(chat, this.t(chat, "effortNoSupport", { model: `${current.provider}/${current.model}`, eff: effText }));
      return;
    }
    const keyboard = efforts.map((name2) => [{
      text: (name2 === effText ? "\u2705 " : "") + name2,
      callback_data: `eff:${name2}`
    }]);
    await this.tg.call("sendMessage", {
      chat_id: chat,
      text: this.t(chat, "effortTitle", { model: `${current.provider}/${current.model}`, eff: effText }),
      reply_markup: JSON.stringify({ inline_keyboard: keyboard })
    });
  }
  // ---------- restart (TG command) ----------
  /** Build the /status text for one chat (its own current session). */
  async buildStatusText(chat) {
    const entry = this.chatEntry(chat);
    const sid = entry.current ?? null;
    const label = sid === null ? this.t(chat, "stNoSession") : await this.sessionLabel(sid);
    let lines = [`${this.t(chat, "stOnline")}
${this.t(chat, "stSession", { label })}
${this.t(chat, "stLoad", { load: loadLabel() })}`];
    if (sid !== null) {
      try {
        const [listRes, modelsRes, presetsRes] = await Promise.all([
          this.dsh("session.list", {}).catch(() => null),
          this.dsh("session.models", { sessionId: sid }).catch(() => null),
          this.dsh("agentPreset.list", {}).catch(() => null)
        ]);
        const items = listRes?.items ?? [];
        const found = items.find((s) => s.sessionId === sid);
        const cur = modelsRes?.current;
        if (cur) {
          const modelText = `${cur.provider}/${cur.model}${cur.reasoningEffort ? ` (${cur.reasoningEffort})` : ""}`;
          lines.push(this.t(chat, "stModel", { m: modelText }));
        }
        const presetId = found?.agentPreset;
        if (presetId) {
          const presetName = (presetsRes?.presets ?? []).find((p) => p.id === presetId)?.name;
          lines.push(this.t(chat, "stMode", { m: this.lang(chat) === "zh" ? presetName ?? presetId : presetId }));
        }
        const v = found?.projections?.values;
        if (v) {
          const tu = v.tokenUsage;
          if (tu) {
            lines.push("");
            lines.push(this.t(chat, "stTokens"));
            lines.push(this.t(chat, "stInput", { v: fmtTokens(tu.uncachedInputTokens) }));
            lines.push(this.t(chat, "stOutput", { v: fmtTokens(tu.outputTokens) }));
            lines.push(this.t(chat, "stCacheRead", { v: fmtTokens(tu.cacheReadTokens) }));
            if (tu.cacheWriteTokens) lines.push(this.t(chat, "stCacheWrite", { v: fmtTokens(tu.cacheWriteTokens) }));
          }
          const cp = v.contextPressure;
          if (cp) {
            lines.push("");
            lines.push(this.t(chat, "stContext", {
              pct: Math.round(cp.pressureTokens / cp.contextWindow * 100),
              used: fmtTokens(cp.pressureTokens),
              total: fmtTokens(cp.contextWindow)
            }));
            const cb = v.contextBreakdown;
            if (cb) lines.push(this.t(chat, "stContextDetail", {
              s: fmtTokens(cb.systemTokens),
              t: fmtTokens(cb.toolsTokens),
              m: fmtTokens(cb.messageTokens)
            }));
          }
          const ss = v.sessionStats;
          if (ss) {
            lines.push("");
            lines.push(this.t(chat, "stTurns", { t: ss.turns, m: ss.steps }));
            lines.push(`LLM ${fmtMs(ss.llmMs)} \xB7 Tool ${fmtMs(ss.toolMs)} \xB7 Decode ${fmtTokens(ss.decodeTokens)} tok`);
          }
          const perms = v.permissions;
          if (perms?.currentValue) lines.push(`
\u{1F510} ${perms.currentValue}`);
        }
      } catch {
      }
    }
    return lines.join("\n");
  }
  /**
  * Restart dsh web without any external script: spawn a detached Node watchdog
  * that waits for this process to exit, then relaunches dsh from the exact
  * argv this process was started with. Zero config and cross-platform (no
  * bash dependency), shareable out of the box.
  *
  * Re-entrancy guard: the restartPending marker doubles as a lock. It is set
  * before the watchdog spawns and cleared by the fresh process after boot, so
  * a second /restart while a restart is in flight is refused — this prevents
  * two watchdog/script invocations from racing and producing an EADDRINUSE
  * double-boot window.
  */
  async handleRestartCommand(chat) {
    if (!this.isAdmin(chat)) {
      await this.send(chat, this.t(chat, "restartDenied"));
      return;
    }
    if (this.state.restartPending) {
      this.log("restart refused: restart already in progress (marker set)");
      await this.send(chat, this.t(chat, "restartPending"));
      return;
    }
    this.state.restartPending = true;
    this.state.restartChat = String(chat);
    this.save();
    try {
      const argv = process.argv;
      const logTarget = stdoutTarget();
      const body = `
        const { spawn } = require("node:child_process");
        const logTarget = ${JSON.stringify(logTarget)};
        const pid = ${process.pid};
        const argv = ${JSON.stringify(argv)};
        const wait = () => {
          try { process.kill(pid, 0); } catch { relaunch(); return; }
          setTimeout(wait, 200);
        };
        const relaunch = () => {
          const out = logTarget ? require("node:fs").openSync(logTarget, "a") : 1;
          const child = spawn(argv[0], argv.slice(1), {
            detached: true,
            stdio: out ? ["ignore", out, out] : "ignore",
            cwd: process.cwd(),
          });
          child.unref();
        };
        wait();
      `;
      const child = spawn(process.execPath, ["-e", body], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      this.log("watchdog spawned, will relaunch:", argv.join(" "));
      try {
        await this.send(chat, this.t(chat, "restarting"));
      } catch {
      }
      setTimeout(() => {
        try {
          process.exit(0);
        } catch {
        }
      }, 500);
    } catch (e) {
      this.log("restart spawn failed:", e.message);
      this.state.restartPending = false;
      this.save();
      await this.send(chat, this.t(chat, "restartFailed", { err: e.message }));
    }
  }
  // ---------- access management (admin TG commands) ----------
  /** Persist the access config to the settings namespace (same source the GUI edits). */
  async persistAccess(chat, nextAllowedUsers, nextAdminChatIds) {
    if (!this.settingsService) {
      this.log("persistAccess: settings service not attached yet");
      await this.send(chat, this.t(chat, "persistUnready"));
      return false;
    }
    try {
      await this.settingsService.update(SETTINGS_NS, { allowedUsers: nextAllowedUsers, adminChatIds: nextAdminChatIds });
      return true;
    } catch (e) {
      this.log("persistAccess: settings.update failed:", e.message);
      await this.send(chat, this.t(chat, "persistFailed", { err: e.message }));
      return false;
    }
  }
  /** Real Telegram display name for a chat: private -> @username or first name, group -> title. Null when unavailable. */
  async chatDisplayName(id) {
    try {
      const info = await this.tg.call("getChat", { chat_id: id });
      if (info.type === "private") return info.username ? `@${info.username}` : info.first_name ?? null;
      return info.title ?? null;
    } catch {
      return null;
    }
  }
  /** Admin: list authorized chats/groups with their admin status. */
  async handleUsersCommand(chat) {
    if (!this.isAdmin(chat)) {
      await this.send(chat, this.t(chat, "adminOnly", { cmd: "/users" }));
      return;
    }
    const map = /* @__PURE__ */ new Map();
    for (const u of this.config.allowedUsers ?? []) map.set(String(u.chatId), { label: u.label, admin: false });
    if (this.config.allowedChat) {
      const id = String(this.config.allowedChat);
      if (!map.has(id)) map.set(id, { label: void 0, admin: false });
    }
    for (const id of this.adminChats) {
      const e = map.get(id) ?? { label: void 0, admin: true };
      e.admin = true;
      map.set(id, e);
    }
    const rows = await Promise.all([...map.entries()].map(async ([id, e]) => {
      const name2 = await this.chatDisplayName(id) ?? e.label ?? id;
      return `${e.admin ? "\u{1F6E1}" : "\u{1F464}"} ${id}  ${name2}`;
    }));
    await this.send(chat, this.t(chat, "usersHeader", { n: rows.length, list: rows.join("\n") || this.t(chat, "usersEmpty") }));
  }
  /** Admin: authorize a chat/group (or the current group with no args). */
  async handleGrantCommand(chat, arg) {
    if (!this.isAdmin(chat)) {
      await this.send(chat, this.t(chat, "adminOnly", { cmd: "/grant" }));
      return;
    }
    let target = String(arg ?? "").trim();
    if (!target) {
      if (String(chat).startsWith("-")) target = chat;
      else {
        await this.send(chat, this.t(chat, "grantUsage"));
        return;
      }
    }
    if (!/^-?\d+$/.test(target)) {
      await this.send(chat, this.t(chat, "grantBadId", { target }));
      return;
    }
    const id = target;
    let label;
    if (String(id).startsWith("-")) {
      try {
        const info = await this.tg.call("getChat", { chat_id: id });
        label = info.title ?? void 0;
      } catch {
      }
    }
    const users = [...this.config.allowedUsers ?? []];
    if (users.some((u) => String(u.chatId) === id)) {
      await this.send(chat, this.t(chat, "grantAlready", { id }));
      return;
    }
    users.push({ chatId: Number(id), label });
    if (!await this.persistAccess(chat, users, [...this.adminChats])) return;
    this.applyAccessConfig({ ...this.config, allowedUsers: users });
    await this.send(chat, this.t(chat, "grantOk", { id, label: label ? this.t(chat, "grantOkLabel", { label }) : "" }));
  }
  /** Admin: remove a chat/group. Never removes the caller or the last admin. */
  async handleRevokeCommand(chat, arg) {
    if (!this.isAdmin(chat)) {
      await this.send(chat, this.t(chat, "adminOnly", { cmd: "/revoke" }));
      return;
    }
    const target = String(arg ?? "").trim();
    if (!/^-?\d+$/.test(target)) {
      await this.send(chat, this.t(chat, "revokeUsage"));
      return;
    }
    const id = String(target);
    if (id === String(chat)) {
      await this.send(chat, this.t(chat, "revokeSelf"));
      return;
    }
    const old = this.config.allowedUsers ?? [];
    if (!old.some((u) => String(u.chatId) === id)) {
      await this.send(chat, this.t(chat, "revokeNotIn", { id }));
      return;
    }
    if (this.isAdmin(id) && this.adminChats.size <= 1) {
      await this.send(chat, this.t(chat, "revokeLastAdmin"));
      return;
    }
    const users = old.filter((u) => String(u.chatId) !== id);
    const admins = [...this.adminChats].filter((a) => a !== id);
    if (!await this.persistAccess(chat, users, admins)) return;
    this.applyAccessConfig({ ...this.config, allowedUsers: users, adminChatIds: admins });
    await this.send(chat, this.t(chat, "revokeOk", { id }));
  }
  /** Admin: add/remove an admin (grant implies authorization). */
  async handleAdminCommand(chat, arg) {
    if (!this.isAdmin(chat)) {
      await this.send(chat, this.t(chat, "adminOnly", { cmd: "/admin" }));
      return;
    }
    const m = String(arg ?? "").trim().match(/^(off\s+)?(-?\d+)(?:\s+.*)?$/);
    if (!m) {
      await this.send(chat, this.t(chat, "adminUsage"));
      return;
    }
    const off = !!m[1];
    const id = m[2];
    if (off && id === String(chat)) {
      await this.send(chat, this.t(chat, "adminSelf"));
      return;
    }
    const admins = /* @__PURE__ */ new Set([...this.adminChats]);
    const users = [...this.config.allowedUsers ?? []];
    if (off) {
      if (!admins.has(id)) {
        await this.send(chat, this.t(chat, "adminNotAdmin", { id }));
        return;
      }
      if (admins.size <= 1) {
        await this.send(chat, this.t(chat, "adminLastAdmin"));
        return;
      }
      admins.delete(id);
    } else {
      if (admins.has(id)) {
        await this.send(chat, this.t(chat, "adminAlready", { id }));
        return;
      }
      admins.add(id);
      if (!users.some((u) => String(u.chatId) === id)) users.push({ chatId: Number(id), label: void 0 });
    }
    if (!await this.persistAccess(chat, users, [...admins])) return;
    this.applyAccessConfig({ ...this.config, allowedUsers: users, adminChatIds: [...admins] });
    await this.send(chat, off ? this.t(chat, "adminOffOk", { id }) : this.t(chat, "adminOk", { id }));
  }
  // ---------- incoming message flow ----------
  async handleMessage(chat, text, quoted, fromId) {
    const sid = await this.ensureSession(chat);
    await this.send(chat, this.t(chat, "working"));
    this.startTyping(chat);
    const r = this.runtime(chat);
    if (fromId !== void 0 && (this.pendingReplies.get(sid) ?? 0) <= 0) r.askerId = fromId;
    this.pendingReplies.set(sid, (this.pendingReplies.get(sid) ?? 0) + 1);
    this.save();
    const waitSeq = r.lastTurnEndSeq;
    const promptText = quoted ? `[\u5F15\u7528\u56DE\u590D]
${quoted}

[\u65B0\u6D88\u606F]
${text}` : text;
    try {
      await this.dsh("session.prompt", { sessionId: sid, mode: "queue", content: [{ type: "text", text: promptText }] });
    } catch (e) {
      const c = (this.pendingReplies.get(sid) ?? 1) - 1;
      if (c <= 0) this.pendingReplies.delete(sid);
      else this.pendingReplies.set(sid, c);
      this.save();
      this.stopTyping(chat);
      throw e;
    }
    setTimeout(() => {
      if (this.stopped) return;
      if (r.lastTurnEndSeq <= waitSeq) {
        this.log("turn timeout, notifying");
        this.stopTyping(chat);
        this.send(chat, this.t(chat, "turnTimeout")).catch(() => {
        });
      }
    }, this.config.turnTimeoutMs);
  }
  // ---------- button callbacks ----------
  /**
  * Whether a pending entry belongs to the chat that produced the click. Entries
  * persisted before chat tracking (chatId undefined) match any chat, so
  * questions/approvals that survived an upgrade still resolve.
  */
  entryForChat(entry, chat) {
    return entry.chatId === void 0 || String(entry.chatId) === String(chat);
  }
  /**
  * Whether the clicker may act on a pending approval/question. The asker owns
  * their buttons; other group members get a denial toast instead of an answer.
  * When the asker was never recorded (entry persisted from before this feature,
  * or a restart in the middle of a turn), a private chat is single-user so the
  * clicker is trusted, while multi-user groups refuse. askerRequired=false
  * restores the old "first clicker wins" behavior.
  */
  denyAsker(entry, chat, clickerId) {
    if (this.config.askerRequired === false) return false;
    if (clickerId === void 0 || clickerId === null) return true;
    if (entry.askerId === void 0 || entry.askerId === null) return String(chat).startsWith("-");
    return String(entry.askerId) !== String(clickerId);
  }
  async handleCallback(cq) {
    const data = cq.data ?? "";
    const tgMsgId = cq.message?.message_id;
    const chat = String(cq.message?.chat?.id ?? "");
    const clickerId = cq.from?.id;
    if (chat && !this.isAllowed(chat)) {
      this.log("callback ignored from unauthorized chat:", chat);
      try {
        await this.tg.call("answerCallbackQuery", { callback_query_id: cq.id, text: this.t(chat, "deniedChat") });
      } catch {
      }
      return;
    }
    this.log("callback received:", JSON.stringify({
      id: cq.id,
      data,
      tgMsgId,
      chat,
      clickerId,
      pendingQuestions: [...this.pendingQuestions.values()].map((x) => x.tgMsgId),
      pendingApprovals: [...this.pendingApprovals.values()].map((x) => x.tgMsgId)
    }));
    let responded = false;
    let denied = false;
    let alertText = null;
    if (data === "allow" || data === "reject") {
      for (const [rpcId, app] of this.pendingApprovals) {
        if (app.tgMsgId !== tgMsgId || !this.entryForChat(app, chat)) continue;
        if (this.denyAsker(app, chat, clickerId)) {
          this.log("approval button denied:", clickerId, "chat", chat, "asker", app.askerId);
          denied = true;
          responded = true;
          alertText = this.t(chat, "deniedApproval");
          break;
        }
        const outcome = data === "allow" ? "allowed-once" : "rejected";
        try {
          await this.dshRespond(rpcId, { sessionId: app.sessionId, approvalId: app.approvalId, outcome });
          this.log("approval answered:", outcome);
        } catch (e) {
          this.log("approval respond err:", e.message);
        }
        this.pendingApprovals.delete(rpcId);
        this.save();
        responded = true;
        break;
      }
    } else if (data.startsWith("q:")) {
      const idx = parseInt(data.slice(2), 10);
      for (const [rpcId, pq] of this.pendingQuestions) {
        if (pq.tgMsgId !== tgMsgId || !this.entryForChat(pq, chat)) continue;
        if (this.denyAsker(pq, chat, clickerId)) {
          this.log("question button denied:", clickerId, "chat", chat, "asker", pq.askerId);
          denied = true;
          responded = true;
          alertText = this.t(chat, "deniedQuestion");
          break;
        }
        const q = pq.questions[0];
        const opt = q.options?.[idx];
        try {
          await this.dshRespond(rpcId, {
            sessionId: pq.sessionId,
            answer: { answers: [{ id: q.id, selected: opt ? [opt.label] : [] }] }
          });
          this.log("question answered:", opt?.label);
        } catch (e) {
          this.log("question respond err:", e.message);
        }
        this.pendingQuestions.delete(rpcId);
        this.save();
        responded = true;
        break;
      }
    } else if (data.startsWith("eff:")) {
      const name2 = data.slice(4);
      const chat2 = String(cq.message?.chat?.id ?? "");
      const sid = this.chatEntry(chat2).current ?? (chat2 ? await this.ensureSession(chat2) : null);
      if (!sid) {
        this.log("effort switch failed: no chat/session");
      } else {
        try {
          const info = await this.dsh("session.models", { sessionId: sid });
          const current = info?.current;
          if (!current) {
            this.log("effort switch failed: no current model");
          } else {
            const res = await this.dsh("session.selectModel", {
              sessionId: sid,
              provider: current.provider,
              model: current.model,
              reasoningEffort: name2
            });
            this.log("effort switched to:", name2);
            this.effortReply = res?.selected?.reasoningEffort ?? name2;
            responded = true;
          }
        } catch (e) {
          this.log("effort switch err:", e.message);
          this.effortReply = `\u274C ${e.message}`;
          responded = true;
        }
      }
    } else if (data.startsWith("perm:")) {
      const name2 = data.slice(5);
      const names = this.permissionPresets?.names ?? [];
      if (!this.permissionPresets || !names.includes(name2)) {
        this.log("permission switch failed: unknown preset", name2);
      } else {
        const chat2 = String(cq.message?.chat?.id ?? "");
        const sid = this.chatEntry(chat2).current ?? (chat2 ? await this.ensureSession(chat2) : null);
        const session = sid ? this.sessionService?.get(sid) : null;
        if (!session) {
          this.log("permission switch failed: no session object for", sid);
        } else {
          try {
            this.permissionPresets.set(session, name2);
            this.log("permission switched to:", name2);
          } catch (e) {
            this.log("permission switch err:", e.message);
          }
          responded = true;
          this.permissionReply = name2;
        }
      }
    } else if (data.startsWith("effopt:")) {
      const rest = data.slice(7);
      const sep = rest.indexOf(":");
      const rpcId = sep === -1 ? rest : rest.slice(0, sep);
      const eff = sep === -1 ? "" : rest.slice(sep + 1);
      const choice = this.pendingEffortChoice.get(rpcId);
      const chat2 = String(cq.message?.chat?.id ?? "");
      if (!choice) {
        this.log("effort choice not found / expired:", rpcId);
        alertText = this.t(chat2, "choiceExpired");
        responded = true;
      } else if (choice.clickerId !== void 0 && cq.from?.id !== choice.clickerId) {
        this.log("effort choice denied for non-initiator:", cq.from?.id, "expected", choice.clickerId);
        alertText = this.t(chat2, "deniedQuestion");
        responded = true;
      } else {
        this.pendingEffortChoice.delete(rpcId);
        this.effoptReply = await this.performModelSwitch(chat2, choice.sessionId, { provider: choice.provider, model: choice.model, name: choice.name }, eff || void 0);
        responded = true;
      }
    } else if (data.startsWith("newmode:")) {
      const presetId = data.slice(8);
      const chat2 = String(cq.message?.chat?.id ?? "");
      const presetsRes = await this.dsh("agentPreset.list", {}).catch(() => null);
      const preset = (presetsRes?.presets ?? []).find((p) => p.id === presetId);
      try {
        const sid = await this.createSessionWithPreset(chat2, presetId);
        this.log("session created with preset:", presetId, sid);
        this.newmodeReply = { name: this.presetLabel(chat2, preset ?? { id: presetId }), sid };
        responded = true;
      } catch (e) {
        this.log("create session err:", e.message);
        this.newmodeReply = { name: `\u274C ${e.message}`, sid: "" };
        responded = true;
      }
    }
    try {
      await this.tg.call("answerCallbackQuery", { callback_query_id: cq.id, text: alertText ?? "", show_alert: !!alertText });
    } catch {
    }
    const replyChat = String(cq.message?.chat?.id ?? this.chats.values().next().value ?? "");
    if (responded && !denied) {
      let replyText = null;
      if (this.permissionReply !== void 0) replyText = this.t(replyChat, "permReply", { name: this.permissionReply });
      else if (this.effortReply !== void 0) replyText = this.t(replyChat, "effortReply", { name: this.effortReply });
      else if (this.effoptReply !== void 0) replyText = this.effoptReply;
      else if (this.newmodeReply !== void 0) replyText = this.t(replyChat, "useNewCreated", { mode: this.newmodeReply.name, sid: this.newmodeReply.sid });
      this.permissionReply = this.effortReply = this.effoptReply = this.newmodeReply = void 0;
      try {
        await this.tg.call("editMessageText", {
          chat_id: replyChat,
          message_id: tgMsgId,
          text: replyText ?? this.t(replyChat, "submitted")
        });
      } catch {
      }
    }
  }
  // ---------- update queue: polling never blocks on processing ----------
  enqueueUpdate(u) {
    this.updateQueue.push(u);
    this.drainQueue();
  }
  async drainQueue() {
    if (this.queueBusy) return;
    this.queueBusy = true;
    try {
      while (this.updateQueue.length) {
        const u = this.updateQueue.shift();
        try {
          await this.processUpdate(u);
        } catch (e) {
          this.log("update err:", e.message);
        }
      }
    } finally {
      this.queueBusy = false;
    }
  }
  async processUpdate(u) {
    this.state.offset = u.update_id + 1;
    this.save();
    if (u.callback_query) {
      await this.handleCallback(u.callback_query);
      return;
    }
    const msg = u.message;
    if (!msg) return;
    const chat = String(msg.chat.id);
    if (!this.isAllowed(chat)) {
      const isPrivateStart = msg.text?.trim() === "/start" && msg.from && !msg.from.is_bot && !String(chat).startsWith("-");
      if (isPrivateStart) {
        const admins = [...this.adminChats];
        const hint = admins.length ? this.t(chat, "unauthorizedHintAdmin", { admin: admins[0] }) : this.t(chat, "unauthorizedHintNone");
        try {
          await this.send(chat, this.t(chat, "unauthorized", { id: chat, hint }));
        } catch {
        }
      } else {
        if (msg.from && !msg.from.is_bot) this.log("ignored message from chat", chat, "type", msg.chat?.type, "text", (msg.text ?? "").slice(0, 40));
      }
      return;
    }
    if (!this.shouldHandleMessage(msg)) return;
    const langCode = msg.from?.language_code;
    if (langCode) {
      this.runtime(chat).language = langCode;
      if (this.state.chatLangs[String(chat)] !== langCode) {
        this.state.chatLangs[String(chat)] = langCode;
        this.save();
      }
    } else if (this.runtime(chat).language === void 0 && this.state.chatLangs?.[String(chat)] === void 0) {
      this.runtime(chat).language = "zh";
    }
    this.log("msg lang:", JSON.stringify(langCode ?? null), "->", this.lang(chat), "chat", chat, "text", (msg.text ?? "").slice(0, 30));
    const text = (msg.text ?? msg.caption ?? "").trim();
    let cmd = text;
    if (this.tg?.myId) {
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const mine = esc(this.tg.myId);
      cmd = cmd.replace(new RegExp(`^@${mine}(?:[ \\t]+|$)`, "i"), "");
      if (cmd.startsWith("/")) cmd = cmd.replace(new RegExp(`^(\\S+)@${mine}(?=[ \\t]|$)`, "i"), "$1");
      cmd = cmd.trim();
    }
    const quoted = quotedTextOf(msg);
    const err = (e) => {
      try {
        this.send(chat, this.t(chat, "handleError", { err: e.message }));
      } catch {
      }
    };
    if (String(chat).startsWith("-") && cmd.startsWith("/") && !["/start", "/status", "/help"].includes(cmd)) {
      await this.send(chat, this.t(chat, "groupCmdDenied", { cmd: cmd.split(/\s/)[0] }));
      return;
    }
    if (cmd === "/start") {
      await this.send(chat, this.t(chat, "startOk"));
      return;
    }
    if (cmd === "/status") {
      await this.send(chat, await this.buildStatusText(chat));
      return;
    }
    if (cmd === "/help") {
      const lang = String(this.runtime(chat).language ?? "").toLowerCase();
      if (String(chat).startsWith("-")) {
        if (lang.startsWith("en")) {
          await this.send(chat, [
            "\u{1F4D6} Group commands:",
            "Send a message or @mention me \u2014 the agent answers.",
            "/start \u2014 check status",
            "/status \u2014 status, tokens, context",
            "/help \u2014 this list",
            "Other commands require a private chat."
          ].join("\n"));
        } else {
          await this.send(chat, [
            "\u{1F4D6} \u7FA4\u7EC4\u53EF\u7528\u547D\u4EE4:",
            "\u76F4\u63A5\u53D1\u6D88\u606F\uFF08\u6216 @\u6211\uFF09\u63D0\u95EE\uFF0Cagent \u4F1A\u56DE\u590D\u3002",
            "/start \u2014 \u68C0\u67E5\u5728\u7EBF",
            "/status \u2014 \u72B6\u6001/token/\u4E0A\u4E0B\u6587",
            "/help \u2014 \u672C\u5217\u8868",
            "\u5176\u4ED6\u547D\u4EE4\u8BF7\u5728\u79C1\u804A\u4E2D\u4F7F\u7528\u3002"
          ].join("\n"));
        }
        return;
      }
      const admin = this.isAdmin(chat);
      if (lang.startsWith("en")) {
        const lines = [
          "\u{1F4D6} Commands:",
          "/sessions \u2014 list all sessions",
          "/use <num|ID|title|new> \u2014 switch / create session",
          "/models \u2014 list models",
          "/model <num> \u2014 switch current session model",
          "/rename <title> \u2014 rename current session",
          "/effort \u2014 adjust reasoning effort (buttons)",
          "/permission \u2014 view / switch permission preset",
          "/status \u2014 status, tokens, context"
        ];
        if (admin) lines.push(
          "/users \u2014 authorized list",
          "/grant <chatId> \u2014 add user/group (in-group /grant grants it)",
          "/revoke <chatId> \u2014 remove access",
          "/admin [off] <chatId> \u2014 manage admins",
          "/restart \u2014 restart DSH web"
        );
        lines.push("Other text \u2014 send to the agent");
        if (String(chat).startsWith("-")) lines.push("In groups, @mention me or reply to my messages.");
        await this.send(chat, lines.join("\n"));
      } else {
        const lines = [
          "\u{1F4D6} \u53EF\u7528\u547D\u4EE4:",
          "/sessions \u2014 \u5217\u51FA\u6240\u6709\u4F1A\u8BDD",
          "/use <\u7F16\u53F7|ID|\u6807\u9898|new> \u2014 \u5207\u6362/\u65B0\u5EFA\u4F1A\u8BDD",
          "/models \u2014 \u5217\u51FA\u6A21\u578B",
          "/model <\u7F16\u53F7> \u2014 \u5207\u6362\u5F53\u524D\u4F1A\u8BDD\u6A21\u578B",
          "/rename <\u65B0\u6807\u9898> \u2014 \u91CD\u547D\u540D\u5F53\u524D\u4F1A\u8BDD",
          "/effort \u2014 \u70B9\u6309\u94AE\u4FEE\u6539\u63A8\u7406\u5F3A\u5EA6",
          "/permission \u2014 \u67E5\u770B\u6743\u9650\u5E76\u70B9\u6309\u94AE\u5207\u6362",
          "/status \u2014 \u5728\u7EBF\u72B6\u6001\u3001token\u3001\u4E0A\u4E0B\u6587"
        ];
        if (admin) lines.push(
          "/users \u2014 \u6388\u6743\u5217\u8868",
          "/grant <chatId> \u2014 \u6DFB\u52A0\u7528\u6237/\u7FA4\u7EC4\uFF08\u7FA4\u91CC\u76F4\u63A5 /grant \u6388\u6743\u5F53\u524D\u7FA4\uFF09",
          "/revoke <chatId> \u2014 \u79FB\u9664\u6388\u6743",
          "/admin [off] <chatId> \u2014 \u8BBE\u7F6E/\u53D6\u6D88\u7BA1\u7406\u5458",
          "/restart \u2014 \u91CD\u542F DSH web"
        );
        lines.push("\u5176\u4ED6\u6587\u672C \u2014 \u53D1\u7ED9 agent");
        if (String(chat).startsWith("-")) lines.push("\u7FA4\u7EC4\u91CC\u8BF7 @\u6211 \u6216\u56DE\u590D\u6211\u7684\u6D88\u606F\u6765\u4F7F\u7528\u3002");
        await this.send(chat, lines.join("\n"));
      }
      return;
    }
    if (cmd.startsWith("/sessions")) {
      try {
        await this.handleSessionsCommand(chat);
      } catch (e) {
        err(e);
      }
      return;
    }
    if (cmd.startsWith("/users")) {
      try {
        await this.handleUsersCommand(chat);
      } catch (e) {
        err(e);
      }
      return;
    }
    if (/^\/use(?:\s|$)/.test(cmd)) {
      try {
        await this.handleUseCommand(chat, cmd.slice(4));
      } catch (e) {
        err(e);
      }
      return;
    }
    if (cmd.startsWith("/models")) {
      try {
        await this.handleModelsCommand(chat);
      } catch (e) {
        err(e);
      }
      return;
    }
    if (cmd.startsWith("/model")) {
      try {
        await this.handleModelCommand(chat, cmd.slice(6), msg.from?.id);
      } catch (e) {
        err(e);
      }
      return;
    }
    if (cmd.startsWith("/rename")) {
      try {
        await this.handleRenameCommand(chat, cmd.slice(7));
      } catch (e) {
        err(e);
      }
      return;
    }
    if (cmd.startsWith("/effort")) {
      try {
        await this.handleEffortCommand(chat);
      } catch (e) {
        err(e);
      }
      return;
    }
    if (cmd.startsWith("/grant")) {
      try {
        await this.handleGrantCommand(chat, cmd.slice(6));
      } catch (e) {
        err(e);
      }
      return;
    }
    if (cmd.startsWith("/revoke")) {
      try {
        await this.handleRevokeCommand(chat, cmd.slice(7));
      } catch (e) {
        err(e);
      }
      return;
    }
    if (cmd.startsWith("/admin")) {
      try {
        await this.handleAdminCommand(chat, cmd.slice(6));
      } catch (e) {
        err(e);
      }
      return;
    }
    if (cmd.startsWith("/restart")) {
      try {
        await this.handleRestartCommand(chat);
      } catch (e) {
        err(e);
      }
      return;
    }
    if (cmd.startsWith("/permission")) {
      try {
        await this.handlePermissionCommand(chat, cmd.slice(11));
      } catch (e) {
        err(e);
      }
      return;
    }
    if (!cmd) return;
    try {
      await this.handleMessage(chat, cmd, quoted, msg.from?.id);
    } catch (e) {
      this.log("handle err:", e.message);
      try {
        await this.send(chat, this.t(chat, "handleError", { err: e.message }));
      } catch {
      }
    }
  }
  // ---------- lifecycle ----------
  start() {
    this.stopped = false;
    this.pollAbort = new AbortController();
    this.log("bridge plugin started");
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.muxTimer) clearTimeout(this.muxTimer);
    this.pollTimer = setTimeout(() => {
      this.pollTimer = void 0;
      if (this.stopped) return;
      this.pollLoop();
    }, 1500);
    this.muxTimer = setTimeout(() => {
      this.muxTimer = void 0;
      if (this.stopped) return;
      this.connectMux();
    }, 1500);
    this.registerCommands();
    setTimeout(() => {
      if (this.stopped) return;
      if (this.state.restartPending) {
        this.log("restart marker found, sending auto status");
        const chat = this.state.restartChat ?? [...this.chats][0];
        delete this.state.restartPending;
        delete this.state.restartChat;
        this.save();
        this.buildStatusText(chat).then((text) => this.send(chat, this.t(chat, "restartDone", { body: text }))).catch((e) => this.log("auto status failed:", e?.message ?? e));
      }
    }, 8e3);
  }
  /** Advertise the bot's command menu to Telegram (the / button next to input). */
  async registerCommands() {
    const zh = [
      { command: "start", description: "\u68C0\u67E5\u5728\u7EBF\u72B6\u6001" },
      { command: "sessions", description: "\u5217\u51FA\u6240\u6709\u4F1A\u8BDD" },
      { command: "use", description: "\u5207\u6362/\u65B0\u5EFA\u4F1A\u8BDD" },
      { command: "models", description: "\u5217\u51FA\u6A21\u578B" },
      { command: "model", description: "\u5207\u6362\u6A21\u578B" },
      { command: "rename", description: "\u91CD\u547D\u540D\u5F53\u524D\u4F1A\u8BDD" },
      { command: "effort", description: "\u70B9\u6309\u94AE\u4FEE\u6539\u63A8\u7406\u5F3A\u5EA6" },
      { command: "permission", description: "\u67E5\u770B/\u5207\u6362\u6743\u9650\u9884\u8BBE" },
      { command: "restart", description: "\u91CD\u542F DSH web" },
      { command: "status", description: "\u5728\u7EBF\u72B6\u6001/token/\u4E0A\u4E0B\u6587" },
      { command: "help", description: "\u547D\u4EE4\u5217\u8868" }
    ];
    const en = [
      { command: "start", description: "Check status" },
      { command: "sessions", description: "List all sessions" },
      { command: "use", description: "Switch / create session" },
      { command: "models", description: "List models" },
      { command: "model", description: "Switch model" },
      { command: "rename", description: "Rename current session" },
      { command: "effort", description: "Adjust reasoning effort" },
      { command: "permission", description: "View / switch permission" },
      { command: "restart", description: "Restart DSH web" },
      { command: "status", description: "Status / tokens / context" },
      { command: "help", description: "Command list" }
    ];
    try {
      try {
        const me = await this.tg.call("getMe", {});
        this.tg.myId = me.username;
        this.log("bot username:", me.username);
      } catch {
      }
      await this.tg.call("setMyCommands", { commands: JSON.stringify(zh) });
      await this.tg.call("setMyCommands", { commands: JSON.stringify(en), language_code: "en" });
      this.log("command menu registered (zh default + en)");
    } catch (e) {
      this.log("setMyCommands failed:", e.message);
    }
  }
  async pollLoop() {
    while (!this.stopped) {
      try {
        const updates = await this.tg.call("getUpdates", {
          offset: this.state.offset,
          timeout: this.config.pollTimeoutSeconds,
          allowed_updates: JSON.stringify(["message", "edited_message", "callback_query"])
        }, { signal: this.pollAbort.signal });
        this.log("poll ok, updates:", updates.length);
        for (const u of updates) this.enqueueUpdate(u);
      } catch (e) {
        this.log("poll err:", e.message);
        await sleep(3e3);
      }
    }
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = void 0;
    }
    if (this.muxTimer) {
      clearTimeout(this.muxTimer);
      this.muxTimer = void 0;
    }
    try {
      this.pollAbort?.abort();
    } catch {
    }
    for (const chat of this.chatState.keys()) this.stopTyping(chat);
    try {
      this.mux?.close();
    } catch {
    }
    this.log("bridge plugin stopped");
  }
};

// lib/index.js
var name = "tg-bridge";
var SETTINGS_NS2 = "tg-bridge";
var CONFIG_PATH = "/api/tg-bridge/config";
function ts2() {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
function isTrustedRequest(req, trustedHosts) {
  const host = req.headers.host;
  if (host === void 0) return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (!isLoopbackHostname(hostUrl.hostname)) {
    const ok = (trustedHosts ?? []).some((entry) => {
      try {
        return new URL(`http://${entry}`).host === hostUrl.host;
      } catch {
        return entry === host;
      }
    });
    if (!ok) return false;
  }
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (origin === void 0) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}
function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
var DEFAULTS = {
  tgApiBase: "https://api.telegram.org",
  dshBaseUrl: "http://127.0.0.1:3080",
  muxUrl: "ws://127.0.0.1:3080/api/events.mux",
  stateFile: dshHomePath("tg-bridge-state.json"),
  pollTimeoutSeconds: 25,
  turnTimeoutMs: 10 * 60 * 1e3,
  tgTimeoutMs: 3e4,
  dshTimeoutMs: 15e3,
  askerRequired: true
};
function fromEnv(name2) {
  const v = process.env[name2];
  return v !== void 0 && v !== "" ? v : void 0;
}
function envOverrides() {
  const o = {};
  const s = (env, key) => {
    const v = fromEnv(env);
    if (v !== void 0) o[key] = v;
  };
  const n = (env, key) => {
    const v = fromEnv(env);
    if (v !== void 0 && Number.isFinite(Number(v))) o[key] = Number(v);
  };
  s("TG_BOT_TOKEN", "botToken");
  s("TG_ALLOWED_CHAT", "allowedChat");
  s("TG_API_BASE", "tgApiBase");
  n("TG_POLL_TIMEOUT_SECONDS", "pollTimeoutSeconds");
  s("TG_STATE_FILE", "stateFile");
  n("TG_TURN_TIMEOUT_MS", "turnTimeoutMs");
  n("TG_TG_TIMEOUT_MS", "tgTimeoutMs");
  n("TG_DSH_TIMEOUT_MS", "dshTimeoutMs");
  s("TG_DSH_BASE_URL", "dshBaseUrl");
  s("TG_MUX_URL", "muxUrl");
  return o;
}
function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) if (v !== void 0) out[k] = v;
  return out;
}
var ConfigSchema = Schema.object({
  botToken: Schema.string().role("secret"),
  allowedChat: Schema.string(),
  allowedUsers: Schema.array(Schema.object({
    chatId: Schema.union([Schema.string(), Schema.number()]),
    label: Schema.string().required(false)
  })).default([]),
  adminChatIds: Schema.array(Schema.union([Schema.string(), Schema.number()])).default([]),
  tgApiBase: Schema.string().default(DEFAULTS.tgApiBase),
  dshBaseUrl: Schema.string().default(DEFAULTS.dshBaseUrl),
  muxUrl: Schema.string().default(DEFAULTS.muxUrl),
  pollTimeoutSeconds: Schema.number().default(DEFAULTS.pollTimeoutSeconds),
  stateFile: Schema.string().default(DEFAULTS.stateFile),
  turnTimeoutMs: Schema.number().default(DEFAULTS.turnTimeoutMs),
  tgTimeoutMs: Schema.number().default(DEFAULTS.tgTimeoutMs),
  dshTimeoutMs: Schema.number().default(DEFAULTS.dshTimeoutMs),
  askerRequired: Schema.boolean().default(DEFAULTS.askerRequired)
});
function apply(ctx, config = {}) {
  const entry = stripUndefined(config);
  let bridge = null;
  let built = false;
  let source = () => entry;
  let permissionPresets = null;
  let sessionService = null;
  let settingsService = null;
  const log = (...a) => console.log(ts2(), "[tg-bridge]", ...a);
  ctx.inject(["permissionPresets", "sessions"], (hostCtx) => {
    permissionPresets = hostCtx.permissionPresets;
    sessionService = hostCtx.sessions;
    try {
      bridge?.attachHost({ permissionPresets, sessionService });
    } catch {
    }
  });
  ctx.inject(["settings"], (sctx) => {
    settingsService = sctx.settings;
    try {
      bridge?.attachHost({ permissionPresets, sessionService, settingsService });
    } catch {
    }
  });
  let webServerPort = null;
  const CORE_KEYS = ["botToken", "tgApiBase", "dshBaseUrl", "muxUrl", "pollTimeoutSeconds", "stateFile", "turnTimeoutMs", "tgTimeoutMs", "dshTimeoutMs"];
  const build = () => {
    const merged = { ...DEFAULTS, ...source(), ...envOverrides() };
    if (webServerPort && merged.dshBaseUrl === DEFAULTS.dshBaseUrl) merged.dshBaseUrl = `http://127.0.0.1:${webServerPort}`;
    if (webServerPort && merged.muxUrl === DEFAULTS.muxUrl) merged.muxUrl = `ws://127.0.0.1:${webServerPort}/api/events.mux`;
    merged.allowedChat = String(merged.allowedChat ?? "");
    const hasAnyChat = !!merged.allowedChat || (merged.allowedUsers ?? []).length > 0;
    if (!merged.botToken || !hasAnyChat) {
      if (built) log("botToken/\u6388\u6743 chat \u7F3A\u5931 \u2014 bridge stopped; configure in GUI \u63D2\u4EF6\u914D\u7F6E or env");
      try {
        bridge?.stop();
      } catch {
      }
      bridge = null;
      return;
    }
    if (bridge && CORE_KEYS.every((k) => bridge.config[k] === merged[k])) {
      bridge.applyAccessConfig(merged);
      built = true;
      return;
    }
    try {
      bridge?.stop();
    } catch {
    }
    if (settingsService == null) {
      try {
        settingsService = ctx.get("settings") ?? null;
      } catch {
      }
    }
    bridge = new Bridge(merged);
    try {
      bridge.attachHost({ permissionPresets, sessionService, settingsService });
    } catch {
    }
    bridge.start();
    built = true;
    log("bridge running (chat=", merged.allowedChat, "api=", merged.tgApiBase, "poll=", merged.pollTimeoutSeconds, "s)");
  };
  installSettingsSection(ctx, settingsNamespace(SETTINGS_NS2), ConfigSchema, entry, {
    setSource: (current) => {
      source = current;
    },
    onChange: () => {
      try {
        build();
      } catch (e) {
        log("reconfigure failed:", e.message);
      }
    }
  });
  if (ctx.get("settings") === void 0) {
    try {
      build();
    } catch (e) {
      log("initial build failed:", e.message);
    }
  }
  ctx.inject(["webServer"], (webCtx) => {
    try {
      webServerPort = webCtx.webServer?.port ?? null;
    } catch {
      webServerPort = null;
    }
    if (webServerPort) {
      try {
        build();
      } catch (e) {
        log("reconfigure after port resolve failed:", e.message);
      }
    }
    const svc = webCtx.get("settings");
    if (svc !== void 0) settingsService = svc;
    try {
      bridge?.attachHost({ permissionPresets, sessionService, settingsService });
    } catch {
    }
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: CONFIG_PATH,
      handler: async (req, res) => {
        const settings = webCtx.get("settings");
        if (settings === void 0) return json(res, 503, { ok: false, error: "settings unavailable" });
        if (!isTrustedRequest(req, webCtx.get("webRuntime")?.trustedHosts)) return json(res, 403, { ok: false, error: "forbidden" });
        try {
          if (req.method === "GET") {
            const value = settings.get(SETTINGS_NS2);
            const wire = value === null || value === void 0 ? null : { ...value };
            if (wire && wire.botToken) wire.botToken = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
            return json(res, 200, { ok: true, value: wire, writable: settings.writable });
          }
          if (req.method === "POST") {
            const raw = await readBody(req);
            let patch;
            try {
              patch = JSON.parse(raw || "{}").patch;
            } catch {
              return json(res, 400, { ok: false, error: "invalid JSON" });
            }
            if (patch === void 0 || typeof patch !== "object" || patch === null) return json(res, 400, { ok: false, error: "patch object required" });
            if (patch.botToken === "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022") delete patch.botToken;
            await settings.update(SETTINGS_NS2, patch);
            return json(res, 200, { ok: true });
          }
          return json(res, 405, { ok: false, error: "method not allowed" });
        } catch (error) {
          return json(res, 400, { ok: false, error: error?.message ?? String(error) });
        }
      }
    }), "tg-bridge: config endpoint");
  });
  return () => {
    try {
      bridge?.stop();
    } catch {
    }
  };
}
export {
  apply,
  name
};
//# sourceMappingURL=index.js.map
