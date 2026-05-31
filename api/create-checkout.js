const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // CORS y validación de método
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { items, email, orderId } = req.body;

  if (!items || items.length === 0 || !email || !orderId) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos.' });
  }

  try {
    // Mapeamos el carrito del frontend al formato que requiere Stripe con 'price_data'
    const line_items = items.map(item => {
      
      // Resumimos los ingredientes para que el cliente los vea en el checkout de Stripe
      const customizations = item.ingredients
        .filter(ing => ing.selected)
        .map(ing => `+ ${ing.nombre}`)
        .join(', ');

      return {
        price_data: {
          currency: 'eur',
          product_data: { 
            name: item.product.nombre, 
            description: customizations || 'Sin extras especiales' 
          },
          // Stripe trabaja en céntimos (ej. 10.50 € -> 1050)
          unit_amount: Math.round(parseFloat(item.product.precio) * 100),
        },
        quantity: 1, // Nuestro carrito gestiona 1 unidad por cada iteración añadida
      };
    });

    // Detectar origen dinámicamente para entornos Vercel (Localhost o Producción)
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const origin = `${protocol}://${host}`;

    // Creación de la sesión de Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'apple_pay', 'google_pay'],
      customer_email: email,
      line_items,
      mode: 'payment',
      success_url: `${origin}/?order_id=${orderId}`,
      cancel_url: `${origin}/?cancel=true`,
    });

    // Devolvemos la URL generada al frontend para redireccionar
    res.status(200).json({ url: session.url });
    
  } catch (error) {
    console.error('Error generando Stripe Checkout:', error);
    res.status(500).json({ error: error.message });
  }
}
