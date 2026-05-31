import { supabase } from './supabase.js';

// ESTADO
let cart = [];
let currentProduct = null;
let currentIngredients = [];
let orderId = localStorage.getItem('order_id');

// DOM Elements
const views = {
  menu: document.getElementById('menu-view'),
  status: document.getElementById('status-view'),
};
const productList = document.getElementById('product-list');
const ingredientModal = document.getElementById('ingredient-modal');
const ingredientList = document.getElementById('ingredient-list');
const cartBar = document.getElementById('cart-bar');

// INICIALIZACIÓN
async function init() {
  if (orderId) {
    showStatusView();
    listenToOrderUpdates(orderId);
    fetchOrderStatus(orderId);
  } else {
    showMenuView();
    await loadProducts();
    listenToStockUpdates();
  }
}

// CARGAR MENÚ
async function loadProducts() {
  const { data: productos, error } = await supabase.from('productos').select('*').eq('disponible', true);
  if (error) return console.error(error);
  
  // He añadido el renderizado opcional de imagen y descripción que añadimos en BD
  productList.innerHTML = productos.map(p => `
    <div class="flex justify-between items-center p-4 border rounded-lg bg-gray-50" id="prod-${p.id}">
      <div class="flex gap-4 items-center">
        ${p.imagen_url ? `<img src="${p.imagen_url}" alt="${p.nombre}" class="w-16 h-16 object-cover rounded-md">` : ''}
        <div>
          <h3 class="font-bold text-lg">${p.nombre}</h3>
          ${p.descripcion ? `<p class="text-xs text-gray-500 mb-1 line-clamp-2">${p.descripcion}</p>` : ''}
          <p class="text-gray-900 font-bold">${p.precio} €</p>
        </div>
      </div>
      <button onclick="openProductModal('${p.id}', '${p.nombre}', ${p.precio})" class="bg-black text-white px-4 py-2 rounded shrink-0 ml-2">Añadir</button>
    </div>
  `).join('');
}

// LÓGICA DE INGREDIENTES
window.openProductModal = async (id, nombre, precio) => {
  currentProduct = { id, nombre, precio };
  const { data: ingredientes } = await supabase.from('ingredientes').select('*').eq('producto_id', id);
  
  currentIngredients = ingredientes.map(ing => ({ ...ing, selected: ing.incluido_por_defecto }));
  
  ingredientList.innerHTML = currentIngredients.map((ing, idx) => `
    <div class="flex justify-between items-center border-b pb-2">
      <span>${ing.nombre}</span>
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" ${ing.selected ? 'checked' : ''} onchange="toggleIngredient(${idx})" class="sr-only peer">
        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
      </label>
    </div>
  `).join('');
  
  document.getElementById('modal-product-name').innerText = nombre;
  ingredientModal.classList.remove('hidden');
};

window.toggleIngredient = (idx) => {
  currentIngredients[idx].selected = !currentIngredients[idx].selected;
};

document.getElementById('btn-cancel-modal').onclick = () => {
  ingredientModal.classList.add('hidden');
};

document.getElementById('btn-add-cart').onclick = () => {
  cart.push({
    product: currentProduct,
    ingredients: [...currentIngredients]
  });
  ingredientModal.classList.add('hidden');
  updateCartUI();
};

function updateCartUI() {
  if (cart.length === 0) {
    cartBar.classList.add('hidden');
    return;
  }
  cartBar.classList.remove('hidden');
  document.getElementById('cart-count').innerText = cart.length;
  const total = cart.reduce((sum, item) => sum + parseFloat(item.product.precio), 0);
  document.getElementById('cart-total').innerText = total.toFixed(2);
}

// CHECKOUT (Stripe Fake/Serverless trigger)
document.getElementById('btn-checkout').onclick = async () => {
  const email = prompt("Introduce tu email para enviarte el recibo y recuperar tu pedido en caso de cierre:");
  if (!email) return;

  const total = cart.reduce((sum, item) => sum + parseFloat(item.product.precio), 0);
  
  const isPaid = confirm(`Simulando Pasarela Stripe (Apple/Google Pay).\nTotal: ${total.toFixed(2)}€\n¿Confirmar pago?`);
  
  if (isPaid) {
    const { data: order, error } = await supabase.from('pedidos').insert({
      email, total, stripe_pi_id: 'pi_fake_' + Date.now(), estado: 'preparando'
    }).select().single();

    for (let item of cart) {
      const { data: oi } = await supabase.from('pedido_items').insert({
        pedido_id: order.id, producto_id: item.product.id, nombre_snapshot: item.product.nombre
      }).select().single();
      
      const customIngs = item.ingredients.map(ing => ({
        pedido_item_id: oi.id, ingrediente_id: ing.id, nombre_snapshot: ing.nombre, incluido: ing.selected
      }));
      await supabase.from('ingredientes_personalizados').insert(customIngs);
    }

    orderId = order.id;
    localStorage.setItem('order_id', orderId);
    cart = [];
    updateCartUI();
    
    showStatusView();
    fetchOrderStatus(orderId);
    listenToOrderUpdates(orderId);
  }
};

// ESTADO Y REALTIME
function showMenuView() { views.menu.classList.remove('hidden'); views.status.classList.add('hidden'); document.getElementById('recovery-section').classList.remove('hidden'); }
function showStatusView() { views.menu.classList.add('hidden'); views.status.classList.remove('hidden'); document.getElementById('recovery-section').classList.add('hidden'); }

async function fetchOrderStatus(id) {
  const { data: order } = await supabase.from('pedidos').select('*').eq('id', id).single();
  if (order) updateStatusUI(order);
}

let clockInterval;
function updateStatusUI(order) {
  document.getElementById('display-id').innerText = '#' + order.display_id;
  const badge = document.getElementById('status-badge');
  const antiScreen = document.getElementById('anti-screenshot');
  const enjoyMsg = document.getElementById('enjoy-msg');

  if (order.estado === 'preparando') {
    badge.innerText = 'PREPARANDO 🧑‍🍳';
    badge.className = 'px-6 py-2 rounded-full text-white font-bold text-xl mb-6 bg-yellow-500';
    antiScreen.classList.add('hidden');
  } 
  else if (order.estado === 'listo') {
    badge.innerText = 'LISTO PARA RECOGER 🍔';
    badge.className = 'px-6 py-2 rounded-full text-white font-bold text-xl mb-6 bg-green-500';
    
    antiScreen.classList.remove('hidden');
    clearInterval(clockInterval);
    clockInterval = setInterval(() => {
      document.getElementById('live-clock').innerText = new Date().toLocaleTimeString();
    }, 1000);
  } 
  else if (order.estado === 'entregado') {
    clearInterval(clockInterval);
    antiScreen.classList.add('hidden');
    badge.innerText = 'ENTREGADO ✅';
    badge.className = 'px-6 py-2 rounded-full text-white font-bold text-xl mb-6 bg-gray-500';
    
    enjoyMsg.classList.remove('hidden');
    localStorage.removeItem('order_id');
    orderId = null;
  }
  else if (order.estado === 'cancelado') {
    alert("Este pedido ha sido cancelado y reembolsado.");
    localStorage.removeItem('order_id');
    window.location.reload();
  }
}

document.getElementById('btn-new-order').onclick = () => window.location.reload();

// RECUPERACIÓN DE SESIÓN (FALLBACK)
document.getElementById('btn-recovery').onclick = async () => {
  const email = prompt("Introduce el email con el que pagaste:");
  if (!email) return;
  
  const { data } = await supabase.from('pedidos')
    .select('*').eq('email', email).in('estado', ['preparando', 'listo']).order('created_at', { ascending: false }).limit(1).single();
  
  if (data) {
    orderId = data.id;
    localStorage.setItem('order_id', orderId);
    init();
  } else {
    alert("No se encontró ningún pedido activo para ese email.");
  }
};

// SUSCRIPCIONES REALTIME MEJORADAS
function listenToOrderUpdates(id) {
  supabase.channel('public:pedidos').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${id}` }, payload => {
    updateStatusUI(payload.new);
  }).subscribe();
}

function listenToStockUpdates() {
  supabase.channel('public:productos')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, payload => {
      
      // Intercepta si el staff ha creado un plato nuevo desde el KDS
      if (payload.eventType === 'INSERT') {
        if (payload.new.disponible) loadProducts();
      } 
      // Intercepta si el staff lo activa/desactiva
      else if (payload.eventType === 'UPDATE') {
        const prodDiv = document.getElementById(`prod-${payload.new.id}`);
        if (prodDiv && !payload.new.disponible) {
          prodDiv.remove(); // Oculta instantáneo
        } else if (!prodDiv && payload.new.disponible) {
          loadProducts(); // Reaparece recargando todo
        }
      }
      
    }).subscribe();
}

init();
