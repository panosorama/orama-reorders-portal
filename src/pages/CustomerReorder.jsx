import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CustomerReorder() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [processing, setProcessing] = useState(false);

  const { data: customer } = useQuery({
    queryKey: ['customer-by-token', token],
    queryFn: async () => {
      const customers = await base44.entities.Customer.filter({ unique_token: token });
      return customers[0];
    },
    enabled: !!token
  });

  const { data: orders = [], refetch } = useQuery({
    queryKey: ['customer-orders', customer?.id],
    queryFn: () => base44.entities.Order.filter({ 
      customer_id: customer.id,
      status: 'available'
    }),
    enabled: !!customer?.id
  });

  const handleReorder = (order) => {
    setSelectedOrder(order);
  };

  const handleApprove = async () => {
    setProcessing(true);
    try {
      // Create QuickBooks invoice
      const { data: qbResponse } = await base44.functions.invoke('createQuickbooksInvoice', {
        order_id: selectedOrder.id,
        quickbooks_customer_id: selectedOrder.quickbooks_customer_id,
        product_type: selectedOrder.product_type,
        specifications: selectedOrder.specifications,
        pricing: selectedOrder.pricing
      });

      if (qbResponse.error) {
        throw new Error(qbResponse.error);
      }

      if (qbResponse.success) {
        // Create Monday.com item
        await base44.functions.invoke('createMondayItem', {
          order_id: selectedOrder.id,
          customer_name: customer.customer_name,
          company_name: customer.company_name,
          product_type: selectedOrder.product_type,
          specifications: selectedOrder.specifications,
          pricing: selectedOrder.pricing
        });

        toast.success("Order approved! Redirecting to payment...");
        
        // Redirect to QuickBooks invoice
        setTimeout(() => {
          window.location.href = qbResponse.invoice_link;
        }, 1500);
      }
    } catch (error) {
      console.error("Order processing error:", error);
      toast.error(error.message || "Failed to process order. Please try again.");
      setProcessing(false);
      setSelectedOrder(null);
    }
  };

  const handleDecline = async () => {
    toast.success("Order declined");
    setSelectedOrder(null);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Invalid access link</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-8 py-6 flex items-center justify-between">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69934b2bd076a1f3a472ce61/9e221aae1_OramaSolutionsLogo2.png" 
            alt="Orama Business Solutions"
            className="h-20 w-auto"
          />
          <div className="text-right">
            <h1 className="text-3xl font-bold text-gray-900">Welcome, {customer.customer_name}!</h1>
            {customer.company_name && (
              <p className="text-gray-600 mt-1">{customer.company_name}</p>
            )}
            <p className="text-gray-500 mt-2">Click on any item below to reorder</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orders.map((order) => (
            <Card key={order.id} className="hover:shadow-xl transition-all cursor-pointer group bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="text-xl group-hover:text-[#EF4444] transition-colors">
                  {order.product_type}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {order.mockup_url && (
                  <div className="relative overflow-hidden rounded-lg">
                    <img
                      src={order.mockup_url}
                      alt={order.product_type}
                      className="w-full h-56 object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                )}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-700 whitespace-pre-line line-clamp-4">
                    {order.specifications}
                  </p>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="text-3xl font-bold text-[#EF4444]">
                    ${order.pricing.toFixed(2)}
                  </span>
                  <Button 
                    onClick={() => handleReorder(order)}
                    className="bg-[#EF4444] hover:bg-[#DC2626] text-white"
                  >
                    Reorder
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {orders.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-500 text-lg">No items available for reorder at this time.</p>
          </div>
        )}
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={() => !processing && setSelectedOrder(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Review Your Order</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-lg mb-3">{selectedOrder.product_type}</h3>
                {selectedOrder.mockup_url && (
                  <img
                    src={selectedOrder.mockup_url}
                    alt={selectedOrder.product_type}
                    className="w-full rounded-lg shadow-lg"
                  />
                )}
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Specifications:</h4>
                <p className="text-sm text-slate-700 whitespace-pre-line">
                  {selectedOrder.specifications}
                </p>
              </div>
              <div className="flex justify-between items-center py-4 border-t">
                <span className="text-2xl font-bold">Total: ${selectedOrder.pricing.toFixed(2)}</span>
              </div>
              <div className="flex gap-4">
                <Button
                  onClick={handleDecline}
                  variant="outline"
                  className="flex-1"
                  disabled={processing}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Decline
                </Button>
                <Button
                  onClick={handleApprove}
                  className="flex-1 bg-black hover:bg-gray-800 text-white"
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve & Pay
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}