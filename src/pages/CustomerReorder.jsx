import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import OrderPreview from "../components/OrderPreview";

export default function CustomerReorder() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
      status: 'available',
      visible: true
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
        pricing: selectedOrder.pricing,
        quantity: selectedOrder.quantity || 1,
        shipping_charge: selectedOrder.shipping_charge || 0,
        is_tax_exempt: customer.is_tax_exempt || false,
        ship_to_address: selectedOrder.ship_to_address || customer.ship_to_address || ""
      });

      console.log("QB Response:", qbResponse);

      if (qbResponse.error) {
        throw new Error(qbResponse.error);
      }

      if (qbResponse.success && qbResponse.invoice_link) {
        const shippingInfo = selectedOrder.shipping_method === "office_pickup" 
          ? "Office Pickup" 
          : `Blind Ship${selectedOrder.ship_to_address ? ` - Ship to: ${selectedOrder.ship_to_address}` : ''}`;

        // Send email notification (fire-and-forget to not block the flow)
        base44.functions.invoke('sendOrderNotifications', {
          customer_name: customer.customer_name,
          company_name: customer.company_name,
          product_type: selectedOrder.product_type,
          pricing: selectedOrder.pricing,
          shipping_info: shippingInfo,
          invoice_number: qbResponse.invoice_id,
          mockup_url: selectedOrder.mockup_url
        }).catch(err => console.error("Email notification failed:", err));

        // Create Monday.com item (fire-and-forget)
        base44.functions.invoke('createMondayItem', {
          order_id: selectedOrder.id,
          customer_name: customer.customer_name,
          company_name: customer.company_name,
          product_type: selectedOrder.product_type,
          specifications: selectedOrder.specifications,
          pricing: selectedOrder.pricing,
          mockup_url: selectedOrder.mockup_url
        }).catch(err => console.error("Monday.com creation failed:", err));

        toast.success("Order approved! Redirecting to payment...");

        // Small delay to show the toast, then redirect
        setTimeout(() => {
          window.location.href = qbResponse.invoice_link;
        }, 1000);
      } else {
        throw new Error("Invoice link not available");
      }
    } catch (error) {
      console.error("Order processing error:", error);
      toast.error(error.message || "Failed to process order. Please try again.");
      setProcessing(false);
      setSelectedOrder(null);
    }
  };



  if (!token) {
   return (
     <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600">Invalid access link</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="h-1 bg-gradient-to-r from-[#EF4444] to-[#f97316]" />
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69934b2bd076a1f3a472ce61/f4868db7a_Untitleddesign12.png"
            alt="Orama Business Solutions"
            className="h-10 w-auto object-contain"
          />
        </div>
        <div className="max-w-6xl mx-auto px-8 pb-6 pt-2">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, <span className="text-[#EF4444]">{customer.customer_name}</span>!</h1>
          {customer.company_name && (
            <p className="text-sm text-gray-500 mt-1">{customer.company_name}</p>
          )}
          <p className="text-sm text-gray-400 mt-1">Browse your previous orders and reorder in just a few clicks</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-16">
         <div>
           <div className="mb-12">
             <h2 className="text-2xl font-semibold text-gray-900 mb-2">Your Previous Orders</h2>
             <p className="text-gray-600">Select any item to place a new order</p>
           </div>
           <div className="mb-6">
             <div className="relative max-w-sm">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
               <Input
                 placeholder="Search orders..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="pl-9 h-9 bg-white border-slate-200 rounded-full text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-red-400"
               />
             </div>
           </div>
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-max">
             {orders.filter(order =>
               order.product_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
               order.specifications?.toLowerCase().includes(searchQuery.toLowerCase()) ||
               order.pricing.toString().includes(searchQuery)
             ).map((order) => (
               <Card key={order.id} onClick={() => handleReorder(order)} className="hover:shadow-lg transition-all duration-300 cursor-pointer group bg-white border-slate-200 overflow-hidden h-full flex flex-col">
                 <div className="relative bg-gray-100 h-64 overflow-hidden flex items-center justify-center">
                    {order.mockup_url && (
                      <img
                        src={order.mockup_url}
                        alt={order.product_type}
                        className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300"
                      />
                    )}
                  </div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg group-hover:text-[#EF4444] transition-colors duration-300 line-clamp-2">
                    {order.product_type}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 flex-1 flex flex-col">
                  <p className="text-xs text-gray-600 line-clamp-2">
                    {order.specifications?.split("\n").map(line => {
                      const colonIdx = line.indexOf(": ");
                      return colonIdx !== -1 ? line.substring(colonIdx + 2) : line;
                    }).filter(Boolean).join(" · ")}
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-auto">
                    <span className="text-xl font-bold text-[#EF4444]">
                      ${order.pricing.toFixed(2)}
                    </span>
                    <Button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReorder(order);
                      }}
                      className="bg-[#EF4444] hover:bg-[#DC2626] text-white h-9 text-sm"
                    >
                      Reorder
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {orders.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-500 text-lg">No items available for reorder at this time.</p>
          </div>
        )}
        {orders.length > 0 && orders.filter(order =>
          order.product_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
          order.specifications?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          order.pricing.toString().includes(searchQuery)
        ).length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-500 text-lg">No orders match your search.</p>
          </div>
        )}
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={() => !processing && setSelectedOrder(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl">Review Your Order</DialogTitle>
            <DialogDescription>
              Review your order details before proceeding to payment.
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="overflow-y-auto flex-1">
              <OrderPreview
                mockupUrl={selectedOrder.mockup_url}
                productType={selectedOrder.product_type}
                specifications={selectedOrder.specifications}
                quantity={selectedOrder.quantity}
                pricing={selectedOrder.pricing}
                shippingCharge={selectedOrder.shipping_charge}
                shippingMethod={selectedOrder.shipping_method}
                shipToAddress={selectedOrder.ship_to_address || customer?.ship_to_address}
                onApprove={handleApprove}
                isProcessing={processing}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}