/* «Серверные компоненты» в браузере: обходим дерево, вызываем асинхронные компоненты сами и дожидаемся данных.
   Клиентские компоненты (файлы с 'use client' помечены плагином сборки флагом $$client) оставляем React,
   разворачивая только переданные им элементы (children, content вкладок и т. п.). */
import { Fragment, cloneElement, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';

type Fn = ((props: Record<string, unknown>) => unknown) & { $$client?: boolean; prototype?: { isReactComponent?: unknown } };

export async function resolve(node: unknown): Promise<ReactNode> {
  if (node == null || typeof node !== 'object') return node as ReactNode;
  if (typeof (node as PromiseLike<unknown>).then === 'function') return resolve(await node);
  if (Array.isArray(node)) return Promise.all(node.map(resolve));
  if (!isValidElement(node)) return node as ReactNode;

  const el = node as ReactElement<Record<string, unknown>>;
  const type = el.type as unknown;
  if (typeof type === 'function' && !(type as Fn).$$client && !(type as Fn).prototype?.isReactComponent) {
    const out = await resolve(await (type as Fn)(el.props));
    return el.key != null ? createElement(Fragment, { key: el.key }, out) : keep(el, out);
  }
  const { children, ...rest } = el.props;
  const props = (await resolveValue(rest)) as Record<string, unknown>;
  // дети из JSX — отдельными аргументами, как в исходном createElement, иначе React примет их за список без key
  if (Array.isArray(children)) return keep(el, cloneElement(el, props, ...(await Promise.all(children.map(resolve)))));
  return keep(el, children === undefined ? cloneElement(el, props) : cloneElement(el, props, await resolve(children)));
}

/* в режиме разработки React помечает «статичных» детей JSX (_store.validated); копия должна сохранить отметку,
   иначе React ошибочно предупреждает про key */
type Dev = { _store?: { validated?: number } };
function keep(from: ReactElement, to: ReactNode): ReactNode {
  const a = (from as Dev)._store, b = isValidElement(to) ? (to as Dev)._store : undefined;
  if (a && b) b.validated = a.validated;
  return to;
}

// элементы могут лежать в props глубоко: массивы и простые объекты
async function resolveValue(v: unknown): Promise<unknown> {
  if (v == null || typeof v !== 'object') return v;
  if (isValidElement(v)) return resolve(v);
  if (Array.isArray(v)) return Promise.all(v.map(resolveValue));
  if (Object.getPrototypeOf(v) !== Object.prototype) return v;
  const out: Record<string, unknown> = {};
  await Promise.all(Object.entries(v).map(async ([k, x]) => { out[k] = await resolveValue(x); }));
  return out;
}
