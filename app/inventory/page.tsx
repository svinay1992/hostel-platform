export const dynamic = 'force-dynamic';

import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addInventoryPurchase,
  getInventoryPurchaseHistory,
  getInventoryUnitPriceMap,
  removeInventoryPurchasesByItemId,
  removeInventoryUnitPrice,
  setInventoryUnitPrice,
} from '../../lib/inventory-purchase-cache';
import {
  addInventoryUsage,
  getInventoryUsageHistory,
  removeInventoryUsageByItemId,
} from '../../lib/inventory-usage-cache';
import { addActivityLog } from '../../lib/activity-log-cache';

type InventoryItem = {
  id: number;
  item_name: string;
  category: string;
  quantity: number;
  unit: string;
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ usage?: string }>;
}) {
  const resolvedParams = await searchParams;
  const usageStatus = (resolvedParams?.usage || '').toLowerCase();

  const { data: inventoryItems } = await supabase
    .from('inventory')
    .select('*')
    .order('category', { ascending: true })
    .order('item_name', { ascending: true });

  const typedItems = (inventoryItems || []) as InventoryItem[];
  const unitPriceMap = await getInventoryUnitPriceMap(typedItems.map((item) => item.id));
  const purchaseHistory = await getInventoryPurchaseHistory();
  const usageHistory = await getInventoryUsageHistory();

  async function addItem(formData: FormData) {
    'use server';
    const item_name = (formData.get('item_name') as string) || '';
    const category = (formData.get('category') as string) || 'Other';
    const quantity = Number(formData.get('quantity') || 0);
    const unit = (formData.get('unit') as string) || 'units';
    const unit_price = Number(formData.get('unit_price') || 0);

    const { data: insertedItem } = await supabase
      .from('inventory')
      .insert([{ item_name, category, quantity, unit }])
      .select('id, item_name, category, quantity, unit')
      .single();

    if (insertedItem?.id) {
      await setInventoryUnitPrice(Number(insertedItem.id), unit_price);
      await addInventoryPurchase({
        item_id: Number(insertedItem.id),
        item_name: insertedItem.item_name,
        category: insertedItem.category,
        quantity: Number(insertedItem.quantity || 0),
        unit: insertedItem.unit || unit,
        unit_price,
        total_cost: Number((Number(insertedItem.quantity || 0) * unit_price).toFixed(2)),
        purchased_at: new Date().toISOString(),
      });
      await addActivityLog({
        module: 'Inventory',
        action: 'Asset Added',
        details: `${insertedItem.item_name} added with qty ${Number(insertedItem.quantity || 0)} ${insertedItem.unit || unit} @ Rs ${unit_price}`,
        actor: 'admin',
        level: 'info',
      });
    }

    revalidatePath('/inventory');
    revalidatePath('/');
  }

  async function updateStock(formData: FormData) {
    'use server';
    const id = Number(formData.get('item_id') || 0);
    const change = Number(formData.get('change') || 0);
    const current_qty = Number(formData.get('current_qty') || 0);
    const item_name = (formData.get('item_name') as string) || 'Inventory Item';
    const category = (formData.get('category') as string) || 'Other';
    const unit = (formData.get('unit') as string) || 'units';
    const unitPriceInput = Number(formData.get('unit_price') || 0);

    const newQty = Math.max(0, Number((current_qty + change).toFixed(2)));

    await supabase
      .from('inventory')
      .update({ quantity: newQty, last_updated: new Date().toISOString() })
      .eq('id', id);

    await setInventoryUnitPrice(id, unitPriceInput);

    if (change > 0) {
      await addInventoryPurchase({
        item_id: id,
        item_name,
        category,
        quantity: change,
        unit,
        unit_price: unitPriceInput,
        total_cost: Number((change * unitPriceInput).toFixed(2)),
        purchased_at: new Date().toISOString(),
      });
      await addActivityLog({
        module: 'Inventory',
        action: 'Stock Increased',
        details: `${item_name} increased by ${change} ${unit} @ Rs ${unitPriceInput}`,
        actor: 'admin',
        level: 'info',
      });
    }

    if (change < 0 && current_qty + change >= 0) {
      const usedQty = Math.abs(change);
      await addInventoryUsage({
        item_id: id,
        item_name,
        category,
        quantity_used: usedQty,
        unit,
        unit_price: unitPriceInput,
        total_cost: Number((usedQty * unitPriceInput).toFixed(2)),
        used_for: 'Quick adjust use',
        used_at: new Date().toISOString(),
      });
      await addActivityLog({
        module: 'Inventory',
        action: 'Stock Decreased',
        details: `${item_name} used ${usedQty} ${unit} (quick adjust)`,
        actor: 'admin',
        level: 'warning',
      });
    }

    revalidatePath('/inventory');
    revalidatePath('/');
  }

  async function useInventoryItem(formData: FormData) {
    'use server';
    const itemIdNum = Number(formData.get('item_id') || 0);
    const quantityToUse = Number(formData.get('quantity_used') || 0);
    const usedFor = ((formData.get('used_for') as string) || '').trim() || 'General use';

    if (!Number.isFinite(itemIdNum) || itemIdNum <= 0 || !Number.isFinite(quantityToUse) || quantityToUse <= 0) {
      return redirect('/inventory?usage=invalid');
    }

    const { data: item } = await supabase
      .from('inventory')
      .select('id, item_name, category, quantity, unit')
      .eq('id', itemIdNum)
      .single();

    if (!item) return redirect('/inventory?usage=not-found');

    const currentQty = Number(item.quantity || 0);
    if (currentQty <= 0 || quantityToUse > currentQty) {
      return redirect('/inventory?usage=insufficient');
    }

    const remainingQty = Number((currentQty - quantityToUse).toFixed(2));
    await supabase
      .from('inventory')
      .update({ quantity: remainingQty, last_updated: new Date().toISOString() })
      .eq('id', itemIdNum);

    const latestUnitPriceMap = await getInventoryUnitPriceMap([itemIdNum]);
    const unitPrice = Number(latestUnitPriceMap[itemIdNum] || 0);

    await addInventoryUsage({
      item_id: itemIdNum,
      item_name: item.item_name,
      category: item.category,
      quantity_used: quantityToUse,
      unit: item.unit || 'units',
      unit_price: unitPrice,
      total_cost: Number((quantityToUse * unitPrice).toFixed(2)),
      used_for: usedFor,
      used_at: new Date().toISOString(),
    });
    await addActivityLog({
      module: 'Inventory',
      action: 'Item Issued',
      details: `${item.item_name} issued: ${quantityToUse} ${item.unit || 'units'} for ${usedFor}`,
      actor: 'admin',
      level: 'info',
    });

    revalidatePath('/inventory');
    revalidatePath('/');
    redirect('/inventory?usage=ok');
  }

  async function deleteItem(formData: FormData) {
    'use server';
    const id = Number(formData.get('item_id') || 0);
    const removeHistory = ((formData.get('remove_history') as string) || 'keep') === 'delete';
    const { data: itemRow } = await supabase
      .from('inventory')
      .select('item_name')
      .eq('id', id)
      .single();

    await supabase.from('inventory').delete().eq('id', id);
    await removeInventoryUnitPrice(id);
    if (removeHistory) {
      await removeInventoryPurchasesByItemId(id);
      await removeInventoryUsageByItemId(id);
    }
    await addActivityLog({
      module: 'Inventory',
      action: 'Asset Removed',
      details: `${itemRow?.item_name || `Item #${id}`} removed from stock (${removeHistory ? 'history deleted' : 'history kept'})`,
      actor: 'admin',
      level: removeHistory ? 'critical' : 'warning',
    });
    revalidatePath('/inventory');
    revalidatePath('/');
  }


  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const activePurchaseHistory = purchaseHistory;
  const activeUsageHistory = usageHistory;

  const monthlyPurchaseTotals = activePurchaseHistory.reduce((acc, entry) => {
    const month = (entry.purchased_at || '').slice(0, 7);
    if (!month) return acc;
    acc[month] = Number((acc[month] || 0) + Number(entry.total_cost || 0));
    return acc;
  }, {} as Record<string, number>);

  const monthlyUsageValueTotals = activeUsageHistory.reduce((acc, entry) => {
    const month = (entry.used_at || '').slice(0, 7);
    if (!month) return acc;
    acc[month] = Number((acc[month] || 0) + Number(entry.total_cost || 0));
    return acc;
  }, {} as Record<string, number>);

  const monthlyUsageQtyTotals = activeUsageHistory.reduce((acc, entry) => {
    const month = (entry.used_at || '').slice(0, 7);
    if (!month) return acc;
    acc[month] = Number((acc[month] || 0) + Number(entry.quantity_used || 0));
    return acc;
  }, {} as Record<string, number>);

  const currentMonthSpend = Number(monthlyPurchaseTotals[currentMonthKey] || 0);
  const currentMonthUsedValue = Number(monthlyUsageValueTotals[currentMonthKey] || 0);
  const currentMonthUsedQty = Number(monthlyUsageQtyTotals[currentMonthKey] || 0);

  const totalInventoryValue = typedItems.reduce((sum, item) => {
    const unitPrice = Number(unitPriceMap[item.id] || 0);
    return sum + Number(item.quantity || 0) * unitPrice;
  }, 0);

  const monthlyAnalysisRows = Object.keys({
    ...monthlyPurchaseTotals,
    ...monthlyUsageValueTotals,
  })
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 12)
    .map((month) => ({
      month,
      purchased: Number(monthlyPurchaseTotals[month] || 0),
      usedValue: Number(monthlyUsageValueTotals[month] || 0),
      usedQty: Number(monthlyUsageQtyTotals[month] || 0),
    }));

  return (
    <main className="flex-1 min-w-0 p-6 lg:p-8 overflow-y-auto overflow-x-hidden bg-gray-50 h-full font-sans">
      <header className="mb-10">
        <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Inventory Management</h2>
        <p className="text-gray-500 mt-1">Track stock, usage, and monthly inventory analytics.</p>
      </header>

      {usageStatus && (
        <div
          className={`mb-6 rounded-lg px-4 py-3 text-sm font-semibold border ${
            usageStatus === 'ok'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}
        >
          {usageStatus === 'ok' && 'Item usage recorded and stock deducted successfully.'}
          {usageStatus === 'not-found' && 'Selected item is not available in inventory.'}
          {usageStatus === 'insufficient' && 'Item is not available in requested quantity.'}
          {usageStatus === 'invalid' && 'Invalid usage input. Please enter valid item and quantity.'}
        </div>
      )}


      <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6 lg:gap-8">
        <div className="2xl:col-span-1 space-y-6">
          <form action={addItem} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-5">
            <h3 className="text-xl font-bold text-gray-800 border-b border-gray-100 pb-3">Add New Asset</h3>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Item Name</label>
              <input type="text" name="item_name" required placeholder="e.g. LED Bulbs" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Category</label>
              <select name="category" required className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                <option value="Hardware & Maintenance">Hardware & Maintenance</option>
                <option value="Mess Groceries">Mess Groceries</option>
                <option value="Cleaning Supplies">Cleaning Supplies</option>
                <option value="Furniture">Furniture</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Initial Qty</label>
                <input type="number" step="0.1" name="quantity" required placeholder="0" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Unit</label>
                <input type="text" name="unit" required placeholder="kg, pieces, liters..." className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Unit Price (Rs)</label>
              <input type="number" step="0.01" min="0" name="unit_price" required placeholder="e.g. 120" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>

            <button type="submit" className="mt-2 w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
              Add to Master Stock
            </button>
          </form>

          <form action={useInventoryItem} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-5">
            <h3 className="text-xl font-bold text-gray-800 border-b border-gray-100 pb-3">Use / Issue Item</h3>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Select Item</label>
              <select name="item_id" required className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-amber-500 outline-none bg-white">
                <option value="">Select inventory item</option>
                {typedItems.map((item) => (
                  <option key={`issue-item-${item.id}`} value={item.id}>
                    {item.item_name} ({item.quantity} {item.unit} available)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Quantity to Use</label>
              <input type="number" step="0.1" min="0.1" name="quantity_used" required placeholder="e.g. 2" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-amber-500 outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Used For</label>
              <input type="text" name="used_for" placeholder="e.g. Room 102 repair / Kitchen daily use" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-amber-500 outline-none" />
            </div>

            <button type="submit" className="w-full bg-amber-600 text-white font-bold py-3 rounded-lg hover:bg-amber-700 transition-colors shadow-sm">
              Deduct and Record Usage
            </button>
          </form>

        </div>

        <div className="2xl:col-span-2 space-y-8 min-w-0">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">Live Stock Levels</h3>
              <div className="flex flex-wrap items-center justify-end gap-4">
                <div className="text-right min-w-[150px]">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Current Month Purchased</p>
                  <p className="text-lg font-black text-rose-600">Rs {currentMonthSpend.toLocaleString('en-IN')}</p>
                </div>
                <div className="text-right min-w-[150px]">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Current Month Used Value</p>
                  <p className="text-lg font-black text-amber-600">Rs {currentMonthUsedValue.toLocaleString('en-IN')}</p>
                </div>
                <div className="text-right min-w-[150px]">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Live Stock Value</p>
                  <p className="text-lg font-black text-indigo-600">Rs {totalInventoryValue.toLocaleString('en-IN')}</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="p-5">Item & Category</th>
                    <th className="p-5 text-center">Unit Price</th>
                    <th className="p-5 text-center">Stock Level</th>
                    <th className="p-5 text-center">Quick Adjust</th>
                    <th className="p-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm bg-white">
                  {typedItems.map((item) => {
                    const isLowStock = item.quantity <= 5;
                    const unitPrice = Number(unitPriceMap[item.id] || 0);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-5">
                          <p className="font-bold text-gray-900">{item.item_name}</p>
                          <p className="text-xs text-gray-500 mt-1">{item.category}</p>
                        </td>
                        <td className="p-5 text-center">
                          <p className="font-black text-indigo-700">Rs {unitPrice.toLocaleString('en-IN')}</p>
                          <p className="text-[10px] text-gray-500 mt-1">Value Rs {(Number(item.quantity || 0) * unitPrice).toLocaleString('en-IN')}</p>
                        </td>
                        <td className="p-5 text-center">
                          <div className={`inline-flex items-center justify-center px-3 py-1 rounded-full font-extrabold text-sm ${isLowStock ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-800 border border-gray-200'}`}>
                            {item.quantity} <span className="text-xs font-medium ml-1 uppercase">{item.unit}</span>
                          </div>
                          {isLowStock && <p className="text-[10px] text-red-500 font-bold mt-1 uppercase">Low Stock</p>}
                        </td>
                        <td className="p-5">
                          <div className="flex items-center justify-center gap-2">
                            <form action={updateStock}>
                              <input type="hidden" name="item_id" value={item.id} />
                              <input type="hidden" name="current_qty" value={item.quantity} />
                              <input type="hidden" name="change" value="-1" />
                              <input type="hidden" name="item_name" value={item.item_name} />
                              <input type="hidden" name="category" value={item.category} />
                              <input type="hidden" name="unit" value={item.unit} />
                              <input type="hidden" name="unit_price" value={unitPrice} />
                              <button type="submit" className="w-8 h-8 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-700 flex items-center justify-center text-lg font-bold text-gray-500 transition-colors" title="Use 1 unit">-</button>
                            </form>
                            <form action={updateStock}>
                              <input type="hidden" name="item_id" value={item.id} />
                              <input type="hidden" name="current_qty" value={item.quantity} />
                              <input type="hidden" name="change" value="1" />
                              <input type="hidden" name="item_name" value={item.item_name} />
                              <input type="hidden" name="category" value={item.category} />
                              <input type="hidden" name="unit" value={item.unit} />
                              <input type="hidden" name="unit_price" value={unitPrice} />
                              <button type="submit" className="w-8 h-8 rounded-full bg-gray-100 hover:bg-green-100 hover:text-green-700 flex items-center justify-center text-lg font-bold text-gray-500 transition-colors" title="Add 1 unit">+</button>
                            </form>
                          </div>
                        </td>
                        <td className="p-5 text-right">
                          <form action={deleteItem} className="flex items-center justify-end gap-2">
                            <input type="hidden" name="item_id" value={item.id} />
                            <select
                              name="remove_history"
                              defaultValue="keep"
                              className="border border-gray-300 rounded-lg px-2 py-1 text-[11px] text-gray-700 bg-white"
                              title="Choose what happens to purchase/usage history for this item"
                            >
                              <option value="keep">Keep history</option>
                              <option value="delete">Delete history too</option>
                            </select>
                            <button type="submit" className="text-gray-400 hover:text-red-600 transition-colors text-xs font-bold uppercase tracking-wider">
                              Remove
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}

                  {typedItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-gray-400 italic font-medium">
                        Inventory is empty. Add your first asset on the left.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">Inventory Tracking and Monthly Analysis</h3>
              <p className="text-xs text-gray-500 mt-1">Current month used quantity: {currentMonthUsedQty.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div>
                <p className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-3">Monthly Analysis</p>
                <div className="space-y-2">
                  {monthlyAnalysisRows.map((row) => (
                    <div key={row.month} className="text-sm border border-gray-100 rounded-lg px-3 py-2">
                      <p className="font-semibold text-gray-700">{new Date(`${row.month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
                      <p className="text-rose-600 font-black mt-1">Purchased: Rs {row.purchased.toLocaleString('en-IN')}</p>
                      <p className="text-amber-600 font-black">Used Value: Rs {row.usedValue.toLocaleString('en-IN')}</p>
                      <p className="text-slate-600 font-semibold">Used Qty: {row.usedQty.toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                  {monthlyAnalysisRows.length === 0 && (
                    <p className="text-sm text-gray-400 italic">No monthly analysis data yet.</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-3">Recent Purchases</p>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {activePurchaseHistory.slice(0, 20).map((entry) => (
                    <div key={entry.id} className="border border-gray-100 rounded-lg px-3 py-2">
                      <p className="text-sm font-bold text-gray-800">{entry.item_name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(entry.purchased_at).toLocaleDateString('en-IN')} | +{entry.quantity} {entry.unit} @ Rs {entry.unit_price}
                      </p>
                      <p className="text-sm font-black text-rose-600 mt-1">Rs {Number(entry.total_cost || 0).toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                  {activePurchaseHistory.length === 0 && (
                    <p className="text-sm text-gray-400 italic">No purchase entries yet.</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-3">Recent Usage</p>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {activeUsageHistory.slice(0, 20).map((entry) => (
                    <div key={entry.id} className="border border-gray-100 rounded-lg px-3 py-2">
                      <p className="text-sm font-bold text-gray-800">{entry.item_name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(entry.used_at).toLocaleDateString('en-IN')} | -{entry.quantity_used} {entry.unit}
                      </p>
                      <p className="text-xs text-gray-500">{entry.used_for || 'General use'}</p>
                      <p className="text-sm font-black text-amber-600 mt-1">Rs {Number(entry.total_cost || 0).toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                  {activeUsageHistory.length === 0 && (
                    <p className="text-sm text-gray-400 italic">No usage entries yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
