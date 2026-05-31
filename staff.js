import { supabase } from './supabase.js';

// DOM Elements
const cols = {
  preparando: document.getElementById('col-preparando'),
  listo: document.getElementById('col-listo'),
  entregado: document.getElementById('col-entregado')
};

// INICIALIZACIÓN
async function initStaff() {
  await fetchOrders();
  listenToAllOrders();
}

async function fetchOrders() {
  // Para MVP obtenemos todo lo que no esté cancelado. 
  // Nota: En producción, añadir filtro de fecha para "historial de hoy".
  const { data: pedidos } = await supabase.from('pedidos')
    .select(`
      id, display_id, estado, stripe_pi_id,
      pedido_items (
        id, nombre_snapshot, cantidad,
        ingredientes_personalizados (nombre_snapshot, incluido)
      )
    `)
    .neq('estado', 'cancelado')
    .order('created_at', { ascending: true });

  renderKanban(pedidos);
}

function renderKanban(pedidos) {
  // Limpiar columnas
  Object.values(cols).forEach(col => col.innerHTML = '');

  pedidos.forEach(p => {
    // Generar bloque HTML de items e ingredientes
    let itemsHtml = p.pedido_items.map(item => {
      let ings = item.ingredientes_personalizados.map(ing => 
        `<span class="text-xs ${ing.incluido ? 'text-green-600' : 'text-red-500 line-through'} block ml-4">
          ${ing.incluido ? '+' : '-'} ${ing.nombre_snapshot}
        </span>`
      ).join('');
      return `<div class="mb-2"><span class="font-bold">${item.cantidad}x ${item.nombre_snapshot}</span>${ings}</div>`;
    }).join('');

    // Generar Botones según estado
    let actionButtons = '';
    if (p.estado === 'preparando') {
      actionButtons = `<button onclick="updateOrderStatus('${p.id}', 'listo')" class="w-full bg-green-500 text-white font-bold py-2 rounded mt-2">MARCAR LISTO</button>`;
    } else if (p.estado === 'listo') {
      actionButtons = `<button onclick="updateOrderStatus('${p.id}', 'entregado')" class="w-full bg-gray-500 text-white font-bold py-2 rounded mt-2">MARCAR ENTREGADO</button>`;
    }
    
    // Botón de reembolso
    const refundBtn = p.estado !== 'entregado' ? `<button onclick="refundOrder('${p.id}', '${p.stripe_pi_id}')" class="w-full mt-2 bg-red-100 text-red-600 text-xs font-bold py-1 border border-red-500 rounded">REEMBOLSAR Y CANCELAR</button>` : '';

    const card = `
      <div class="border p-3 rounded shadow-sm bg-gray-50 relative" id="order-${p.id}">
        <div class="text-lg font-black mb-2 text-blue-700 border-b pb-1">#${p.display_id}</div>
        <div class="text-sm mb-3">${itemsHtml}</div>
        ${actionButtons}
        ${refundBtn}
      </div>
    `;

    if (cols[p.estado]) cols[p.estado].insertAdjacentHTML('beforeend', card);
  });
}

// ACTUALIZAR ESTADOS
window.updateOrderStatus = async (id, newStatus) => {
  await supabase.from('pedidos').update({ estado: newStatus }).eq('id', id);
};

// REEMBOLSOS (Llama a Vercel Serverless Function)
window.refundOrder = async (orderId, paymentIntentId) => {
  if(!confirm('¿Estás seguro de cancelar el pedido y reembolsar el dinero al cliente?')) return;
  
  try {
    /* 
    const res = await fetch('/api/refund', {
      method: 'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ payment_intent_id: paymentIntentId })
    });
    */
    alert("Simulación: Reembolso Stripe ejecutado correctamente.");
    await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', orderId);
  } catch (e) {
    alert("Error al procesar el reembolso.");
  }
};

// REALTIME PARA STAFF
function listenToAllOrders() {
  supabase.channel('staff-pedidos').on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, payload => {
    fetchOrders(); // Recarga simple para mantener los items actualizados. En producción, mover DOM element para evitar refetch.
  }).subscribe();
}

// GESTIÓN DE STOCK (Toggles)
const stockModal = document.getElementById('stock-modal');
document.getElementById('btn-stock-toggle').onclick = async () => {
  const { data: prods } = await supabase.from('productos').select('*').order('nombre');
  
  document.getElementById('stock-list').innerHTML = prods.map(p => `
    <div class="flex justify-between items-center border-b pb-2">
      <span class="font-bold text-lg">${p.nombre}</span>
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" ${p.disponible ? 'checked' : ''} onchange="toggleStock('${p.id}', this.checked)" class="sr-only peer">
        <div class="w-11 h-6 bg-red-500 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
      </label>
    </div>
  `).join('');
  
  stockModal.classList.remove('hidden');
};

document.getElementById('btn-close-stock').onclick = () => stockModal.classList.add('hidden');

window.toggleStock = async (id, disponible) => {
  await supabase.from('productos').update({ disponible }).eq('id', id);
};

initStaff();
