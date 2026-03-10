import { supabase } from '../../../../lib/supabase';
import Link from 'next/link';
import PrintReceiptButton from '../../../_components/print-receipt-button';
import { getPaidAtMap } from '../../../../lib/invoice-paid-at-cache';
import { getBreakdownNotes } from '../../../../lib/invoice-breakdown-cache';
import { resolveInvoiceBreakdown } from '../../../../lib/billing-breakdown';

type ReceiptStudent = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  room_number: string | null;
  bed_number: string | null;
};

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const invoiceId = resolvedParams.id;

  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      *,
      student_admissions (
        full_name, email, phone, room_number, bed_number
      )
    `)
    .eq('id', invoiceId)
    .single();

  if (!invoice) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-2xl font-bold text-red-600">Receipt Not Found</h2>
        <Link href="/finance" className="text-indigo-600 mt-4 inline-block hover:underline">&larr; Back to Finance</Link>
      </div>
    );
  }

  const studentData = invoice.student_admissions as ReceiptStudent | null;
  const breakdownNotesMap = await getBreakdownNotes([Number(invoice.id)]);
  const invoiceWithBreakdown = {
    ...invoice,
    additional_notes: breakdownNotesMap[Number(invoice.id)] || invoice.additional_notes || null,
  };
  const breakdown = resolveInvoiceBreakdown(invoiceWithBreakdown, Number(invoice.amount ?? 0));

  const paidAtMap = await getPaidAtMap([Number(invoice.id)]);
  const paidAtValue = invoice.paid_at || paidAtMap[Number(invoice.id)] || null;

  const studentName = studentData?.full_name || 'Unknown Student';
  const email = studentData?.email || 'N/A';
  const phone = studentData?.phone || 'N/A';
  const roomNumber = studentData?.room_number || 'N/A';
  const bedNumber = studentData?.bed_number || 'N/A';

  return (
    <div className="h-screen w-full bg-gray-200 px-2 py-2 sm:px-3 sm:py-3 lg:px-4 lg:py-4 flex justify-center font-sans overflow-hidden">
      <div className="w-full h-full flex justify-center items-start overflow-hidden">
        <div className="origin-top w-full max-w-[980px] max-h-[calc(100vh-0.5rem)] scale-[0.64] sm:scale-[0.74] md:scale-[0.84] lg:scale-[0.92] xl:scale-100">
          <div className="bg-white w-full shadow-2xl p-5 sm:p-7 lg:p-8 border border-gray-300 relative">
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 print:hidden flex items-center gap-3">
          <Link href="/finance" className="text-gray-500 hover:text-gray-800 text-sm font-bold transition-colors">
            &larr; Back
          </Link>
          <PrintReceiptButton />
        </div>

        <div className="flex justify-between items-start border-b-2 border-gray-100 pb-6 mb-6">
          <div>
            <h1 className="text-4xl font-black text-indigo-700 tracking-tighter">HMP</h1>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Hostel Management Pro</p>
            <p className="text-sm text-gray-600 mt-4">123 University Road<br />Tech District, City 400001<br />contact@hmp-admin.com</p>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-extrabold text-gray-200 uppercase tracking-widest">Receipt</h2>
            <p className="text-sm font-bold text-gray-800 mt-2">Receipt No: <span className="text-gray-500 font-medium">#INV-{invoice.id.toString().padStart(4, '0')}</span></p>
            <p className="text-sm font-bold text-gray-800">Date: <span className="text-gray-500 font-medium">{new Date(invoice.created_at).toLocaleDateString('en-IN')}</span></p>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Billed To</h3>
          <p className="text-xl font-bold text-gray-900">{studentName}</p>
          <p className="text-sm text-gray-600 mt-1">Room {roomNumber} - Bed {bedNumber}</p>
          <p className="text-sm text-gray-600">{phone} - {email}</p>
        </div>

        <table className="w-full text-left mb-6 table-fixed">
          <thead className="bg-gray-50 border-y border-gray-200 text-xs uppercase text-gray-600 font-bold tracking-wider">
            <tr>
              <th className="py-3 px-3 sm:px-4 w-[42%]">Description</th>
              <th className="py-3 px-3 sm:px-4 text-center w-[33%]">Info</th>
              <th className="py-3 px-3 sm:px-4 text-right w-[25%]">Amount</th>
            </tr>
          </thead>
          <tbody className="text-sm border-b border-gray-200 divide-y divide-gray-100">
            <tr>
              <td className="py-4 px-3 sm:px-4 font-bold text-gray-800 break-words">Base Rent</td>
              <td className="py-4 px-3 sm:px-4 text-center text-gray-600 break-words">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-IN') : '-'}</td>
              <td className="py-4 px-3 sm:px-4 text-right font-bold text-gray-900 break-words">Rs {Number(breakdown.baseRent ?? 0).toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td className="py-4 px-3 sm:px-4 font-bold text-gray-800 break-words">Electricity</td>
              <td className="py-4 px-3 sm:px-4 text-center text-gray-600 break-words">{Number(breakdown.electricityUnits ?? 0)} units @ Rs {Number(breakdown.electricityRate ?? 0)}</td>
              <td className="py-4 px-3 sm:px-4 text-right font-bold text-gray-900 break-words">Rs {Number(breakdown.electricityAmount ?? 0).toLocaleString('en-IN')}</td>
            </tr>
            {(breakdown.services || []).length > 0 ? (
              <>
                {breakdown.services.map((service, idx) => (
                  <tr key={`receipt-service-${idx}`}>
                    <td className="py-4 px-3 sm:px-4 font-bold text-gray-800 break-words">Custom Service</td>
                    <td className="py-4 px-3 sm:px-4 text-center text-gray-600 break-words">{service.name}</td>
                    <td className="py-4 px-3 sm:px-4 text-right font-bold text-gray-900 break-words">Rs {Number(service.amount ?? 0).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-4 px-3 sm:px-4 font-bold text-gray-800 break-words">Service Total</td>
                  <td className="py-4 px-3 sm:px-4 text-center text-gray-600 break-words">-</td>
                  <td className="py-4 px-3 sm:px-4 text-right font-bold text-gray-900 break-words">Rs {Number(breakdown.customServiceAmount ?? 0).toLocaleString('en-IN')}</td>
                </tr>
              </>
            ) : (
              <tr>
                <td className="py-4 px-3 sm:px-4 font-bold text-gray-800 break-words">Custom Service</td>
                <td className="py-4 px-3 sm:px-4 text-center text-gray-600 break-words">{breakdown.customServiceName || '-'}</td>
                <td className="py-4 px-3 sm:px-4 text-right font-bold text-gray-900 break-words">Rs {Number(breakdown.customServiceAmount ?? 0).toLocaleString('en-IN')}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="flex justify-between items-end">
          <div>
            <div className={`inline-flex items-center justify-center px-4 py-2 rounded font-extrabold text-lg uppercase tracking-wider border-2 ${invoice.status === 'Paid' ? 'border-green-500 text-green-600' : 'border-red-500 text-red-600'}`}>
              {invoice.status}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Paid</p>
            <p className="text-4xl font-black text-gray-900">Rs {Number(invoice.amount).toLocaleString('en-IN')}</p>
            <p className="text-xs text-gray-500 mt-2">Paid At: {paidAtValue ? new Date(paidAtValue).toLocaleString('en-IN') : 'Not paid yet'}</p>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100 text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Thank you for your payment</p>
          <p className="text-xs text-gray-400 italic">System generated receipt.</p>
        </div>
          </div>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        body > aside { display: none !important; }
        @media print {
          body > aside { display: none !important; }
          html, body { overflow: auto !important; }
          body { display: block !important; }
          body { background-color: white; }
          .print\\:hidden { display: none !important; }
          .shadow-2xl { box-shadow: none !important; }
          .border { border: none !important; }
          .min-h-screen { min-height: auto !important; }
          .max-w-\\[980px\\] { max-width: 100% !important; }
          [class*="scale-\\["] { transform: none !important; }
        }
      `,
        }}
      />
    </div>
  );
}
