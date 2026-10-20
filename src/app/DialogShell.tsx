import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import { cn } from "../lib/cn";

export function DialogShell({
  open,
  onClose,
  kicker,
  title,
  children,
  footer,
  wide,
  className,
}: {
  open: boolean;
  onClose: () => void;
  kicker?: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <ModalOverlay
      className="modal-overlay"
      isDismissable
      isOpen={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Modal className={cn("dialog", wide && "dialog--wide", className)}>
        <Dialog>
          <div className="dialog__head">
            <div>
              {kicker ? <span className="dialog__kicker">{kicker}</span> : null}
              <Heading slot="title" className="dialog__title">
                {title}
              </Heading>
            </div>
            <button
              type="button"
              className="dialog__close"
              aria-label="Close dialog"
              onClick={onClose}
            >
              <X className="icon" />
            </button>
          </div>
          <div className="dialog__body">{children}</div>
          {footer ? <div className="dialog__foot">{footer}</div> : null}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
