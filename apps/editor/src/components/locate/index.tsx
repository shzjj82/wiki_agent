import { cloneElement, isValidElement, type MouseEvent, type ReactElement } from "react";
import type { LocateTarget } from "@/lib/locate/target";

type Clickable = {
  onClick?: (event: MouseEvent<HTMLElement>) => void;
};

type Props = {
  /** 已知目标就带上。打开时才知道文档的，先传 null，由 onLocate 补齐。 */
  target: LocateTarget | null;
  onLocate: (target: LocateTarget | null) => void | Promise<void>;
  /** 外层是什么元素由调用方决定，这里只补上点击后的跳转。 */
  children: ReactElement<Clickable>;
};

/** 给任意可点击元素加上定位。不规定它必须是按钮、链接或菜单项。 */
export function Locate({ target, onLocate, children }: Props) {
  if (!isValidElement(children)) {
    return children;
  }
  return cloneElement(children, {
    onClick: (event: MouseEvent<HTMLElement>) => {
      children.props.onClick?.(event);
      if (event.defaultPrevented) {
        return;
      }
      void onLocate(target);
    },
  });
}
