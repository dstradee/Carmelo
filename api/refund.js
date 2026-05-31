const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { payment_intent_id } = req.body;

  try {
    const refund = await stripe.refunds.create({ payment_intent: payment_intent_id });
    res.status(200).json({ success: true, refund });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
