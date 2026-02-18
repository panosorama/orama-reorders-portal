import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import PageHeader from "../components/PageHeader";

import { createPageUrl } from "../utils";
import { toast } from "sonner";


export default function CustomerDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const customerId = urlParams.get('id');

  const [open, setOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [productType, setProductType] = useState("");
  const [specifications, setSpecifications] = useState("");
  const [pricing, setPricing] = useState("");
  const [quantity, setQuantity] = useState("");
  const [mockupFile, setMockupFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [shippingMethod, setShippingMethod] = useState("blind_ship");
  const [customShipAddress, setCustomShipAddress] = useState("");
  const [shippingCharge, setShippingCharge] = useState("");

  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch (error) {
        base44.auth.redirectToLogin();
        return null;
      }
    }
  });

  const { data: customer } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: async () => {
      const customers = await base44.entities.Customer.filter({ id: customerId });
      return customers[0];
    },
    enabled: !!customerId
  });

  const { data: orders = [], refetch } = useQuery({
    queryKey: ['orders', customerId],
    queryFn: () => base44.entities.Order.filter({ customer_id: customerId }, '-created_date'),
    enabled: !!customerId
  });



  if (loadingUser || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  const handleAddOrder = async (e) => {
    e.preventDefault();
    setUploading(true);

    try {
      let mockupUrl = editingOrder?.mockup_url || "";
      if (mockupFile) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: mockupFile });
        mockupUrl = file_url;
      }

      const orderData = {
        customer_id: customerId,
        product_type: productType,
        specifications: specifications,
        pricing: parseFloat(pricing),
        quantity: quantity ? parseFloat(quantity) : null,
        shipping_charge: shippingCharge ? parseFloat(shippingCharge) : 0,
        mockup_url: mockupUrl,
        status: editingOrder?.status || "available",
        quickbooks_customer_id: customer?.quickbooks_customer_id,
        quickbooks_customer_name: customer?.quickbooks_customer_name,
        shipping_method: shippingMethod,
        ship_to_address: shippingMethod === "blind_ship" ? (customShipAddress || customer?.ship_to_address || "") : null
      };

      if (editingOrder) {
        await base44.entities.Order.update(editingOrder.id, orderData);
        toast.success("Order updated successfully!");
      } else {
        await base44.entities.Order.create(orderData);
        toast.success("Order added successfully!");
      }

      setOpen(false);
      setEditingOrder(null);
      setProductType("");
      setSpecifications("");
      setPricing("");
      setQuantity("");
      setShippingCharge("");
      setMockupFile(null);
      setShippingMethod("blind_ship");
      setCustomShipAddress("");
      refetch();
    } catch (error) {
      toast.error(editingOrder ? "Failed to update order" : "Failed to add order");
    } finally {
      setUploading(false);
    }
  };

  const handleEditOrder = (order) => {
    setEditingOrder(order);
    setProductType(order.product_type);
    setSpecifications(order.specifications);
    setPricing(order.pricing.toString());
    setQuantity(order.quantity?.toString() || "");
    setShippingCharge(order.shipping_charge?.toString() || "");
    setShippingMethod(order.shipping_method || "blind_ship");
    setCustomShipAddress(order.ship_to_address || "");
    setOpen(true);
  };

  const handleDeleteOrder = async (orderId) => {
    if (window.confirm("Are you sure you want to delete this order?")) {
      try {
        await base44.entities.Order.delete(orderId);
        toast.success("Order deleted successfully!");
        refetch();
      } catch (error) {
        toast.error("Failed to delete order");
      }
    }
  };

  const handleToggleVisibility = async (order) => {
    try {
      await base44.entities.Order.update(order.id, {
        visible: !order.visible
      });
      toast.success(order.visible ? "Order hidden from portal" : "Order shown in portal");
      refetch();
    } catch (error) {
      toast.error("Failed to update visibility");
    }
  };

  if (!customer) return <div className="p-8">Loading...</div>;

  const dialogOnOpenChange = (isOpen) => {
    setOpen(isOpen);
    if (!isOpen) {
      setEditingOrder(null);
      setProductType("");
      setSpecifications("");
      setPricing("");
      setQuantity("");
      setShippingCharge("");
      setMockupFile(null);
      setShippingMethod("blind_ship");
      setCustomShipAddress("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <PageHeader
        backTo="AdminDashboard"
        backLabel="Dashboard"
        actions={null}
      />

      <Dialog open={open} onOpenChange={dialogOnOpenChange}>
            <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingOrder ? "Edit Order" : "Add Previous Order"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddOrder} className="space-y-4">
                <div>
                  <Label htmlFor="productType">Product Type *</Label>
                  <Input
                    id="productType"
                    value={productType}
                    onChange={(e) => setProductType(e.target.value)}
                    required
                    placeholder="Business Cards, Brochures, Menus, etc."
                  />
                </div>
                <div>
                  <Label htmlFor="specifications">Specifications *</Label>
                  <Textarea
                    id="specifications"
                    value={specifications}
                    onChange={(e) => setSpecifications(e.target.value)}
                    required
                    rows={6}
                    placeholder="Size: 3.5x2&#10;Material: 16pt Cardstock&#10;Finish: Matte&#10;Quantity: 500&#10;Colors: Full Color Front, Black & White Back"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                 <div>
                   <Label htmlFor="pricing">Price (USD) *</Label>
                   <Input
                     id="pricing"
                     type="number"
                     step="0.01"
                     value={pricing}
                     onChange={(e) => setPricing(e.target.value)}
                     required
                     placeholder="99.99"
                   />
                 </div>
                 <div>
                   <Label htmlFor="quantity">Quantity</Label>
                   <Input
                     id="quantity"
                     type="number"
                     value={quantity}
                     onChange={(e) => setQuantity(e.target.value)}
                     placeholder="500"
                   />
                 </div>
                 <div>
                   <Label htmlFor="shippingCharge">Shipping Charge (USD)</Label>
                   <Input
                     id="shippingCharge"
                     type="number"
                     step="0.01"
                     value={shippingCharge}
                     onChange={(e) => setShippingCharge(e.target.value)}
                     placeholder="0.00"
                   />
                 </div>
                </div>
                <div>
                   <Label htmlFor="mockup">Design Mockup</Label>
                   <Input
                     id="mockup"
                     type="file"
                     accept="image/*"
                     onChange={(e) => setMockupFile(e.target.files[0])}
                   />
                   <p className="text-xs text-slate-500 mt-1">Upload a preview image of the design</p>
                 </div>
                 <div className="space-y-3">
                   <Label>Shipping Method</Label>
                   <div className="flex items-center gap-4">
                     <label className="flex items-center gap-2 cursor-pointer">
                       <input
                         type="radio"
                         value="office_pickup"
                         checked={shippingMethod === "office_pickup"}
                         onChange={(e) => setShippingMethod(e.target.value)}
                       />
                       <span className="text-sm">Office Pickup</span>
                     </label>
                     <label className="flex items-center gap-2 cursor-pointer">
                       <input
                         type="radio"
                         value="blind_ship"
                         checked={shippingMethod === "blind_ship"}
                         onChange={(e) => setShippingMethod(e.target.value)}
                       />
                       <span className="text-sm">Blind Ship</span>
                     </label>
                   </div>
                   {shippingMethod === "blind_ship" && (
                     <div>
                       <Label htmlFor="shipAddress">Shipping Address</Label>
                       <Input
                         id="shipAddress"
                         value={customShipAddress}
                         onChange={(e) => setCustomShipAddress(e.target.value)}
                         placeholder={customer?.ship_to_address || "Enter shipping address"}
                       />
                       {customer?.ship_to_address && !customShipAddress && (
                         <p className="text-xs text-slate-500 mt-1">Using customer's default: {customer.ship_to_address}</p>
                       )}
                     </div>
                   )}
                 </div>
                 <Button type="submit" className="w-full" disabled={uploading}>
                  {uploading ? "Uploading..." : editingOrder ? "Update Order" : "Add Order"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.customer_name}</h1>
            {customer.company_name && (
              <p className="text-base text-gray-500 mt-1">{customer.company_name}</p>
            )}
          </div>
          <Button className="bg-[#EF4444] hover:bg-[#DC2626] text-white" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Order
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {orders.map((order) => (
            <Card key={order.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">{order.product_type}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.mockup_url && (
                   <div className="flex items-center justify-center bg-gray-50 rounded-lg h-48">
                     <img
                       src={order.mockup_url}
                       alt={order.product_type}
                       className="max-w-full max-h-full object-contain"
                     />
                   </div>
                 )}
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-sm text-slate-700 whitespace-pre-line">{order.specifications}</p>
                </div>
                 <div className="flex justify-between items-center mb-3">
                  <span className="text-2xl font-bold text-[#EF4444]">${order.pricing.toFixed(2)}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${order.visible ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {order.visible ? 'Visible' : 'Hidden'}
                  </span>
                </div>
                <p className="text-sm text-slate-500 capitalize mb-3">{order.status.replace('_', ' ')}</p>
                {order.shipping_method && (
                  <div className="bg-blue-50 p-2 rounded-lg mb-3 text-sm">
                    {order.shipping_method === "office_pickup" ? (
                      <p className="text-blue-800 font-medium">📍 Office Pickup</p>
                    ) : (
                      <>
                        <p className="text-blue-800 font-medium">📦 Blind Ship</p>
                        {order.ship_to_address && (
                          <p className="text-blue-700 text-xs mt-1">Ship to: {order.ship_to_address}</p>
                        )}
                      </>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleEditOrder(order)}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleToggleVisibility(order)}
                  >
                    {order.visible ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                    {order.visible ? 'Hide' : 'Show'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDeleteOrder(order.id)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {orders.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-500 text-lg">No orders yet. Add previous orders for this customer.</p>
          </div>
        )}
      </div>
    </div>
  );
}