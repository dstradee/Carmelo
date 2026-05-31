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
  Object.values(cols).forEach(col => col.innerHTML = '');

  pedidos.forEach(p => {
    let itemsHtml = p.pedido_items.map(item => {
      let ings = item.ingredientes_personalizados.map(ing => 
        `<span class="text-xs ${ing.incluido ? 'text-green-600' : 'text-red-500 line-through'} block ml-4">
          ${ing.incluido ? '+' : '-'} ${ing.nombre_snapshot}
        </span>`
      ).join('');
      return `<div class="mb-2"><span class="font-bold">${item.cantidad}x ${item.nombre_snapshot}</span>${ings}</div>`;
    }).join('');

    let actionButtons = '';
    if (p.estado === 'preparando') {
      actionButtons = `<button onclick="updateOrderStatus('${p.id}', 'listo')" class="w-full bg-green-500 text-white font-bold py-2 rounded mt-2">MARCAR LISTO</button>`;
    } else if (p.estado === 'listo') {
      actionButtons = `<button onclick="updateOrderStatus('${p.id}', 'entregado')" class="w-full bg-gray-500 text-white font-bold py-2 rounded mt-2">MARCAR ENTREGADO</button>`;
    }
    
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

// REEMBOLSOS
window.refundOrder = async (orderId, paymentIntentId) => {
  if(!confirm('¿Estás seguro de cancelar el pedido y reembolsar el dinero al cliente?')) return;
  
  try {
    alert("Simulación: Reembolso Stripe ejecutado correctamente.");
    await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', orderId);
  } catch (e) {
    alert("Error al procesar el reembolso.");
  }
};

// REALTIME PARA STAFF
function listenToAllOrders() {
  supabase.channel('staff-pedidos').on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, payload => {
    fetchOrders(); 
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

// --- LÓGICA DEL CREADOR DE MENÚ ---
const productModal = document.getElementById('product-modal');
const formNewProduct = document.getElementById('form-new-product');
const dynamicIngredients = document.getElementById('dynamic-ingredients');

// Abrir y cerrar modal
document.getElementById('btn-new-product').onclick = () => {
  formNewProduct.reset();
  dynamicIngredients.innerHTML = ''; 
  productModal.classList.remove('hidden');
};

document.getElementById('btn-close-product-modal').onclick = () => {
  productModal.classList.add('hidden');
};

// Añadir campos dinámicos de ingredientes
document.getElementById('btn-add-ingredient-field').onclick = () => {
  const row = document.createElement('div');
  row.className = 'flex gap-2 items-center bg-gray-50 p-2 rounded border';
  row.innerHTML = `
    <input type="text" placeholder="Ej. Queso Cheddar" required class="flex-1 border rounded p-1 text-sm ing-name">
    <label class="flex items-center gap-1 text-sm whitespace-nowrap">
      <input type="checkbox" checked class="ing-default"> Por defecto
    </label>
    <button type="button" class="text-red-500 font-bold px-2" onclick="this.parentElement.remove()">X</button>
  `;
  dynamicIngredients.appendChild(row);
};

// Guardar producto e ingredientes en Supabase
formNewProduct.onsubmit = async (e) => {
  e.preventDefault();
  
  // 1. Insertar el Producto
  const { data: newProduct, error: prodError } = await supabase.from('productos')
    .insert({
      nombre: document.getElementById('prod-name').value,
      precio: parseFloat(document.getElementById('prod-price').value),
      descripcion: document.getElementById('prod-desc').value,
      imagen_url: document.getElementById('prod-img').value,
      disponible: true
    })
    .select()
    .single();

  if (prodError) return alert('Error al crear producto: ' + prodError.message);

  // 2. Extraer y formatear los ingredientes dinámicos
  const ingRows = dynamicIngredients.querySelectorAll('div.flex');
  const ingredientesData = Array.from(ingRows).map(row => ({
    producto_id: newProduct.id,
    nombre: row.querySelector('.ing-name').value,
    incluido_por_defecto: row.querySelector('.ing-default').checked
  }));

  // 3. Insertar ingredientes de forma masiva (Bulk Insert)
  if (ingredientesData.length > 0) {
    const { error: ingError } = await supabase.from('ingredientes').insert(ingredientesData);
    if (ingError) return alert('Error al guardar ingredientes: ' + ingError.message);
  }

  alert('¡Producto creado exitosamente!');
  productModal.classList.add('hidden');
};

// Arrancar KDS
initStaff();
