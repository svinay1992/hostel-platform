'use client';

import { useMemo, useRef, useState } from 'react';

type CustomService = {
  name: string;
  amount: number;
};

type FinanceDraftRowProps = {
  invoiceId: number;
  studentName: string;
  billMonthLabel: string;
  baseRent: number;
  dueDateLabel: string;
  initialElectricityUnits: number;
  initialElectricityRate: number;
  initialCustomServices: CustomService[];
  additionalNotes: string;
  finalizeBillAction: (formData: FormData) => void | Promise<void>;
  deleteInvoiceAction: (formData: FormData) => void | Promise<void>;
};

export default function FinanceDraftRow({
  invoiceId,
  studentName,
  billMonthLabel,
  baseRent,
  dueDateLabel,
  initialElectricityUnits,
  initialElectricityRate,
  initialCustomServices,
  additionalNotes,
  finalizeBillAction,
  deleteInvoiceAction,
}: FinanceDraftRowProps) {
  const [electricityUnits, setElectricityUnits] = useState(initialElectricityUnits);
  const [electricityRate, setElectricityRate] = useState(initialElectricityRate);
  const [services, setServices] = useState<CustomService[]>(
    initialCustomServices.length > 0 ? initialCustomServices : [{ name: '', amount: 0 }]
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const finalizeFormRef = useRef<HTMLFormElement>(null);

  const normalizedServices = useMemo(
    () =>
      services
        .map((svc) => ({
          name: String(svc.name || '').trim(),
          amount: Number.isFinite(Number(svc.amount)) ? Number(svc.amount) : 0,
        }))
        .filter((svc) => svc.name || svc.amount > 0),
    [services]
  );
  const customServiceAmount = useMemo(
    () => Number(normalizedServices.reduce((sum, svc) => sum + svc.amount, 0).toFixed(2)),
    [normalizedServices]
  );
  const customServiceName = useMemo(
    () => (normalizedServices.length > 0 ? normalizedServices.map((svc) => svc.name || 'Service').join(', ') : ''),
    [normalizedServices]
  );
  const electricityAmount = useMemo(
    () => Number((electricityUnits * electricityRate).toFixed(2)),
    [electricityRate, electricityUnits]
  );
  const totalAmount = useMemo(
    () => Number((baseRent + electricityAmount + customServiceAmount).toFixed(2)),
    [baseRent, customServiceAmount, electricityAmount]
  );

  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors align-top">
        <td className="p-5 font-bold text-slate-900 min-w-48">{studentName}</td>
        <td className="p-5 font-medium text-slate-700 min-w-36">{billMonthLabel}</td>
        <td className="p-5 min-w-36">
          <span className="font-bold text-slate-800">Rs {baseRent.toLocaleString('en-IN')}</span>
          <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">From Admission Advance Rent</p>
        </td>
        <td className="p-5 min-w-48">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={electricityUnits}
                onChange={(e) => setElectricityUnits(Number(e.target.value || 0))}
                className="w-16 rounded border border-slate-200 px-2 py-1.5 text-xs font-bold"
              />
              <span className="text-xs font-bold text-slate-500">units x</span>
              <input
                type="number"
                step="0.01"
                value={electricityRate}
                onChange={(e) => setElectricityRate(Number(e.target.value || 0))}
                className="w-16 rounded border border-slate-200 px-2 py-1.5 text-xs font-bold"
              />
            </div>
            <span className="text-[11px] text-slate-500 font-semibold">
              Amount Rs {electricityAmount.toLocaleString('en-IN')}
            </span>
          </div>
        </td>
        <td className="p-5 min-w-56">
          <div className="flex flex-col gap-2">
            {services.map((service, index) => (
              <div key={`svc-${index}`} className="flex items-center gap-2">
                <input
                  type="text"
                  value={service.name}
                  onChange={(e) =>
                    setServices((prev) =>
                      prev.map((entry, i) => (i === index ? { ...entry, name: e.target.value } : entry))
                    )
                  }
                  placeholder={`Service ${index + 1}`}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs font-semibold"
                />
                <input
                  type="number"
                  step="0.01"
                  value={service.amount}
                  onChange={(e) =>
                    setServices((prev) =>
                      prev.map((entry, i) => (i === index ? { ...entry, amount: Number(e.target.value || 0) } : entry))
                    )
                  }
                  placeholder="Amount"
                  className="w-24 rounded border border-slate-200 px-2 py-1.5 text-xs font-semibold"
                />
                {services.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setServices((prev) => prev.filter((_, i) => i !== index))}
                    className="text-rose-500 hover:text-rose-600 text-xs font-black px-2"
                    title="Remove service"
                  >
                    X
                  </button>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setServices((prev) => [...prev, { name: '', amount: 0 }])}
                className="text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-700"
              >
                + Add Service
              </button>
              <span className="text-[11px] text-slate-500 font-semibold">
                Service Total Rs {customServiceAmount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </td>
        <td className="p-5 font-black text-slate-900 text-base min-w-36">Rs {totalAmount.toLocaleString('en-IN')}</td>
        <td className="p-5 text-slate-700 min-w-36">{dueDateLabel}</td>
        <td className="p-5 min-w-52">
          <span className="text-slate-400">Not paid</span>
        </td>
        <td className="p-5">
          <span className="text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider text-indigo-700 bg-indigo-100">
            Draft
          </span>
        </td>
        <td className="p-5 text-right min-w-60">
          <div className="flex justify-end items-center gap-2 flex-wrap">
            <form ref={finalizeFormRef} action={finalizeBillAction}>
              <input type="hidden" name="invoice_id" value={invoiceId} />
              <input type="hidden" name="base_rent_snapshot" value={baseRent} />
              <input type="hidden" name="electricity_units" value={electricityUnits} />
              <input type="hidden" name="electricity_rate" value={electricityRate} />
              <input type="hidden" name="electricity_amount_snapshot" value={electricityAmount} />
              <input type="hidden" name="custom_service_name" value={customServiceName} />
              <input type="hidden" name="custom_service_amount" value={customServiceAmount} />
              <input type="hidden" name="custom_services_json" value={JSON.stringify(normalizedServices)} />
              <input type="hidden" name="total_amount_snapshot" value={totalAmount} />
              <input type="hidden" name="additional_notes" value={additionalNotes || ''} />
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase tracking-wider px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                Finalize Bill
              </button>
            </form>

            <form action={deleteInvoiceAction}>
              <input type="hidden" name="invoice_id" value={invoiceId} />
              <button type="submit" className="text-slate-400 hover:text-rose-500 bg-white border border-slate-200 hover:border-rose-200 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded-lg transition-colors shadow-sm">
                Delete
              </button>
            </form>
          </div>
        </td>
      </tr>

      {showConfirm && (
        <tr>
          <td colSpan={10} className="p-0">
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6">
                <h4 className="text-xl font-black text-slate-900">Confirm Bill Finalization</h4>
                <p className="text-sm text-slate-500 mt-1">{studentName} - {billMonthLabel}</p>

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span>Base Rent</span><strong>Rs {baseRent.toLocaleString('en-IN')}</strong></div>
                  <div className="flex justify-between"><span>Electricity ({electricityUnits} units x Rs {electricityRate})</span><strong>Rs {electricityAmount.toLocaleString('en-IN')}</strong></div>
                  {normalizedServices.length > 0 ? (
                    <>
                      {normalizedServices.map((svc, index) => (
                        <div key={`confirm-svc-${index}`} className="flex justify-between">
                          <span>Service: {svc.name || `Service ${index + 1}`}</span>
                          <strong>Rs {Number(svc.amount || 0).toLocaleString('en-IN')}</strong>
                        </div>
                      ))}
                      <div className="flex justify-between">
                        <span>Custom Service Subtotal</span>
                        <strong>Rs {customServiceAmount.toLocaleString('en-IN')}</strong>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between"><span>Custom Service</span><strong>Rs 0</strong></div>
                  )}
                  <div className="border-t border-slate-200 pt-2 flex justify-between text-base"><span className="font-bold">Total Payable</span><strong>Rs {totalAmount.toLocaleString('en-IN')}</strong></div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => finalizeFormRef.current?.requestSubmit()}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700"
                  >
                    Confirm and Finalize
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
