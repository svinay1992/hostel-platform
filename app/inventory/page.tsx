// Cache Buster
export const dynamic = 'force-dynamic';

import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';

export default async function InventoryPage() {
  
  // 1. Fetch all inventory items safely
  const { data: inventoryItems } = await supabase
    .from('inventory')
    .select('*')
    .order('category', { ascending: true })
    .order('item_name', { ascending: true });

  // 2. SERVER ACTION: Add new item
  async function addItem(formData: FormData) {
    'use server';
    const item_name = formData.get('item_name') as string;
    const category = formData.get('category') as string;
    const quantity = parseFloat(formData.get('quantity') as string);
    const unit = formData.get('unit') as string;

    await supabase.from('inventory').insert([{ item_name, category, quantity, unit }]);
    revalidatePath('/inventory');
  }

  // 3. SERVER ACTION: Update stock quantity
  async function updateStock(formData: FormData) {
    'use server';
    const id = formData.get('item_id') as string;
    const change = parseFloat(formData.get('change') as string);
    const current_qty = parseFloat(formData.get('current_qty') as string);
    
    const newQty = Math.max(0, current_qty + change); // Prevent negative stock

    await supabase
      .from('inventory')
      .update({ quantity: newQty, last_updated: new Date().toISOString() })
      .eq('id', id);
      
    revalidatePath('/inventory');
  }

  // 4. SERVER ACTION: Delete an item
  async function deleteItem(formData: FormData) {
    'use server';
    const id = formData.get('item_id') as string;
    await supabase.from('inventory').delete().eq('id', id);
    revalidatePath('/inventory');
  }

  return (
    <main className="flex-1 p-10 overflow-y-auto bg-gray-50 h-full font-sans">
      <header className="mb-10">
        <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">📦 Inventory Management</h2>
        <p className="text-gray-500 mt-1">Track hostel assets, hardware, and mess supplies.</p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: Add Item Form */}
        <div className="xl:col-span-1">
          <form action={addItem} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-5 sticky top-10">
            <h3 className="text-xl font-bold text-gray-800 border-b border-gray-100 pb-3">Add New Asset</h3>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Item Name</label>
              <input type="text" name="item_name" required placeholder="e.g. LED Bulbs" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Category</label>
              <select name="category" required className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                <option value="Hardware & Maintenance">🛠️ Hardware & Maintenance</option>
                <option value="Mess Groceries">🥕 Mess Groceries</option>
                <option value="Cleaning Supplies">🧹 Cleaning Supplies</option>
                <option value="Furniture">🛏️ Furniture</option>
                <option value="Other">📦 Other</option>
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

            <button type="submit" className="mt-2 w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
              Add to Master Stock
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: Live Stock Table */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">Live Stock Levels</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="p-5">Item & Category</th>
                    <th className="p-5 text-center">Stock Level</th>
                    <th className="p-5 text-center">Quick Adjust</th>
                    <th className="p-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm bg-white">
                  {inventoryItems?.map((item: any) => {
                    // Logic to flag low stock intelligently
                    const isLowStock = item.quantity <= 5;

                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-5">
                          <p className="font-bold text-gray-900">{item.item_name}</p>
                          <p className="text-xs text-gray-500 mt-1">{item.category}</p>
                        </td>
                        
                        <td className="p-5 text-center">
                          <div className={`inline-flex items-center justify-center px-3 py-1 rounded-full font-extrabold text-sm ${isLowStock ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-800 border border-gray-200'}`}>
                            {item.quantity} <span className="text-xs font-medium ml-1 text-opacity-80 uppercase">{item.unit}</span>
                          </div>
                          {isLowStock && <p className="text-[10px] text-red-500 font-bold mt-1 uppercase">Low Stock</p>}
                        </td>

                        <td className="p-5">
                          <div className="flex items-center justify-center gap-2">
                            {/* Deduct Stock Form */}
                            <form action={updateStock}>
                              <input type="hidden" name="item_id" value={item.id} />
                              <input type="hidden" name="current_qty" value={item.quantity} />
                              <input type="hidden" name="change" value="-1" />
                              <button type="submit" className="w-8 h-8 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-700 flex items-center justify-center text-lg font-bold text-gray-500 transition-colors" title="Use 1 unit">-</button>
                            </form>
                            
                            {/* Add Stock Form */}
                            <form action={updateStock}>
                              <input type="hidden" name="item_id" value={item.id} />
                              <input type="hidden" name="current_qty" value={item.quantity} />
                              <input type="hidden" name="change" value="1" />
                              <button type="submit" className="w-8 h-8 rounded-full bg-gray-100 hover:bg-green-100 hover:text-green-700 flex items-center justify-center text-lg font-bold text-gray-500 transition-colors" title="Add 1 unit">+</button>
                            </form>
                          </div>
                        </td>

                        <td className="p-5 text-right">
                          {/* THE FIX: Removed the onSubmit popup event from this form */}
                          <form action={deleteItem}>
                            <input type="hidden" name="item_id" value={item.id} />
                            <button type="submit" className="text-gray-400 hover:text-red-600 transition-colors text-xs font-bold uppercase tracking-wider">
                              Remove
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}

                  {(!inventoryItems || inventoryItems.length === 0) && (
                    <tr>
                      <td colSpan={4} className="p-10 text-center text-gray-400 italic font-medium">
                        Inventory is empty. Add your first asset on the left!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}                           