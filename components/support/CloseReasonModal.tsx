interface CloseReasonModalProps {
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal that asks an admin to provide a reason before closing a support ticket.
 * Renders nothing of its own visibility — caller controls mounting.
 */
export function CloseReasonModal({
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
}: CloseReasonModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">Закрыть тикет</h3>
        <label htmlFor="close-reason" className="mb-4 block text-sm text-neutral-400">
          Укажите причину закрытия тикета:
        </label>
        <textarea
          id="close-reason"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Введите причину закрытия..."
          rows={4}
          className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
        />
        <div className="mt-4 flex gap-3">
          <button
            onClick={onConfirm}
            disabled={!reason.trim()}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:bg-neutral-700 disabled:text-neutral-500"
          >
            Закрыть
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg bg-neutral-700 px-4 py-2 font-medium text-white transition-colors hover:bg-neutral-600"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
