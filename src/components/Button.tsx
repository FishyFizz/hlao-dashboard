import { Button as AriaButton, type ButtonProps } from "react-aria-components";
import { cn } from "../lib/cn";

type Variant = "secondary" | "primary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export type DashboardButtonProps = Omit<ButtonProps, "className"> & {
  className?: string;
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: DashboardButtonProps) {
  return (
    <AriaButton
      className={cn("btn", `btn--${variant}`, size !== "md" && `btn--${size}`, className)}
      {...props}
    />
  );
}

export function IconButton({
  variant = "ghost",
  size = "sm",
  className,
  ...props
}: DashboardButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={cn("btn--icon", className)}
      {...props}
    />
  );
}
