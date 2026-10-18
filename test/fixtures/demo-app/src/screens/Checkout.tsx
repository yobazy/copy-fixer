import { useState } from 'react';
import { toast } from '../toast';

export function Checkout({ total, name }: { total: string; name: string }) {
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    try {
      await submitPayment();
      toast('Payment successful!');
    } catch {
      setError('Oops! Something went wrong');
    }
  }

  return (
    <main>
      <h1>Checkout</h1>
      <p>Hey {name}, you're almost there. Review your order below.</p>
      <label htmlFor="card">Card Number</label>
      <input id="card" placeholder="Enter your card number here" />
      {error && <p role="alert">{error}</p>}
      <button onClick={pay}>Submit</button>
      <button onClick={() => history.back()}>Cancel</button>
      <button aria-label="Close checkout">×</button>
      <small>By clicking Submit you agree to our Terms of Service.</small>
      <p>Total: {total}</p>
    </main>
  );
}

async function submitPayment() {}
