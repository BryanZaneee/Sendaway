import { supabase } from '../config/supabase';
import { authService } from './auth.service';

export type ProductType = 'pro_upgrade';

export interface CheckoutResult {
  success: boolean;
  url?: string;
  error?: string;
}

class PaymentService {
  /**
   * Create a Stripe checkout session
   */
  private async createCheckout(productType: ProductType): Promise<CheckoutResult> {
    const user = authService.getUser();

    if (!user) {
      return { success: false, error: 'You must be logged in to make a purchase' };
    }

    // Already pro? Don't allow duplicate purchase
    if (productType === 'pro_upgrade' && authService.isPro()) {
      return { success: false, error: 'You are already a Pro user' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          productType,
          userId: user.id
        }
      });

      if (error) {
        console.error('Checkout error:', error);
        return { success: false, error: 'Failed to create checkout session' };
      }

      if (!data?.url) {
        return { success: false, error: 'Invalid checkout response' };
      }

      return { success: true, url: data.url };
    } catch (err) {
      console.error('Checkout error:', err);
      return { success: false, error: 'Failed to connect to payment service' };
    }
  }

  /**
   * Redirect to Stripe checkout
   */
  async redirectToCheckout(productType: ProductType): Promise<void> {
    const result = await this.createCheckout(productType);

    if (result.success && result.url) {
      window.location.href = result.url;
    } else {
      throw new Error(result.error || 'Failed to start checkout');
    }
  }
}

export const paymentService = new PaymentService();
