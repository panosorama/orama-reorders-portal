import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, ExternalLink, Copy, Loader2, Check, ChevronsUpDown, Trash2, Edit, Search, LogOut, CheckCircle2, MoreVertical, Settings } from "lucide-react";
import PageHeader from "../components/PageHeader";
import QuickbooksSettingsDialog from "../components/QuickbooksSettingsDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { toast } from "sonner";

export default function AdminDashboard() {
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");

  const [selectedQBCustomer, setSelectedQBCustomer] = useState("");
  const [qbOpen, setQbOpen] = useState(false);
  const [createQBOpen, setCreateQBOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [newQBCustomer, setNewQBCustomer] = useState({
    displayName: "",
    companyName: "",
    givenName: "",
    familyName: "",
    email: "",
    phone: ""
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [deleteCustomer, setDeleteCustomer] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);
  const [qbSettingsOpen, setQbSettingsOpen] = useState(false);
  const [shipToAddress, setShipToAddress] = useState("");
  const [isTaxExempt, setIsTaxExempt] = useState(false);

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

  const { data: customers = [], refetch } = useQuery({
    queryKey: ['customers'],
    queryFn: () => base44.entities.Customer.list('-created_date')
  });

  const { data: qbCustomers = [], isLoading: loadingQB, refetch: refetchQB, error: qbError } = useQuery({
    queryKey: ['qbCustomers'],
    queryFn: async () => {
      try {
        const response = await base44.functions.invoke('getQuickbooksCustomers', {});
        if (response.data.error) {
          throw new Error(response.data.error);
        }
        return response.data.customers || [];
      } catch (error) {
        console.error("QB customers error:", error);
        throw error;
      }
    },
    retry: 2,
    retryDelay: 1000
  });

  if (loadingUser || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md w-full mx-4 text-center">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-yellow-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Awaiting Approval</h1>
            <p className="text-gray-500 text-sm mb-6">
              Your account is pending admin approval. You'll be able to access the dashboard once an administrator approves your account.
            </p>
            <Button variant="outline" onClick={() => base44.auth.logout()}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const generateToken = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    
    if (!selectedQBCustomer) {
      toast.error("Please select a QuickBooks customer from the dropdown");
      return;
    }

    try {
      const uniqueToken = generateToken();
      const qbCustomer = qbCustomers.find(c => c.id === selectedQBCustomer);
      
      await base44.entities.Customer.create({
        customer_name: customerName,
        company_name: companyName,
        email: email,
        unique_token: uniqueToken,
        quickbooks_customer_id: selectedQBCustomer,
        quickbooks_customer_name: qbCustomer?.name,
        ship_to_address: shipToAddress,
        is_tax_exempt: isTaxExempt
      });

      toast.success("Customer created successfully!");
      setOpen(false);
      setCustomerName("");
      setCompanyName("");
      setEmail("");
      setSelectedQBCustomer("");
      setQuantity("");
      setShipToAddress("");
      setIsTaxExempt(false);
      refetch();
    } catch (error) {
      toast.error("Failed to create customer: " + error.message);
    }
  };

  const copyLink = (token) => {
    const url = `${window.location.origin}${createPageUrl(`CustomerReorder?token=${token}`)}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard!");
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleCreateQBCustomer = async () => {
    if (!newQBCustomer.displayName) {
      toast.error("Display Name is required");
      return;
    }
    
    try {
      // Auto-populate email from the customer form if empty
      const qbCustomerData = {
        ...newQBCustomer,
        email: newQBCustomer.email || email
      };
      
      const response = await base44.functions.invoke('createQuickbooksCustomer', qbCustomerData);
      
      if (response.data.success) {
        toast.success("QuickBooks customer created!");
        const created = response.data.customer;
        setLastCreatedQBCustomer(created);
        setNewQBCustomer({
          displayName: "",
          companyName: "",
          givenName: "",
          familyName: "",
          email: "",
          phone: ""
        });
        await refetchQB();
        setSelectedQBCustomer(created.id);
        setCreateQBOpen(false);
      } else {
        toast.error(response.data.error || "Failed to create customer");
      }
    } catch (error) {
      console.error("QBCustomer creation error:", error);
      const errorMessage = error.response?.data?.error || error.message || "Failed to create QuickBooks customer";
      toast.error(errorMessage);
    }
  };

  const handleEditCustomer = async (e) => {
    e.preventDefault();
    
    if (!selectedQBCustomer) {
      toast.error("Please select a QuickBooks customer from the dropdown");
      return;
    }

    try {
      const qbCustomer = qbCustomers.find(c => c.id === selectedQBCustomer);
      
      await base44.entities.Customer.update(editingCustomer.id, {
        customer_name: customerName,
        company_name: companyName,
        email: email,
        quickbooks_customer_id: selectedQBCustomer,
        quickbooks_customer_name: qbCustomer?.name,
        ship_to_address: shipToAddress,
        is_tax_exempt: isTaxExempt
      });

      toast.success("Customer updated successfully!");
      setEditingCustomer(null);
      setOpen(false);
      setCustomerName("");
      setCompanyName("");
      setEmail("");
      setSelectedQBCustomer("");
      setQuantity("");
      setShipToAddress("");
      setIsTaxExempt(false);
      refetch();
    } catch (error) {
      toast.error("Failed to update customer: " + error.message);
    }
  };

  const handleDeleteCustomer = async () => {
    try {
      await base44.entities.Customer.delete(deleteCustomer.id);
      toast.success("Customer deleted successfully!");
      setDeleteCustomer(null);
      refetch();
    } catch (error) {
      toast.error("Failed to delete customer: " + error.message);
    }
  };

  const openEditDialog = (customer) => {
    setEditingCustomer(customer);
    setCustomerName(customer.customer_name);
    setCompanyName(customer.company_name || "");
    setEmail(customer.email || "");
    setSelectedQBCustomer(customer.quickbooks_customer_id);
    setShipToAddress(customer.ship_to_address || "");
    setIsTaxExempt(customer.is_tax_exempt || false);
    setOpen(true);
  };

  const handleSignOut = () => {
    base44.auth.logout();
  };

  const filteredCustomers = customers.filter(customer => 
    customer.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const dialogOnOpenChange = (isOpen) => {
    setOpen(isOpen);
    if (!isOpen) {
      setEditingCustomer(null);
      setCustomerName("");
      setCompanyName("");
      setEmail("");
      setSelectedQBCustomer("");
      setShipToAddress("");
      setIsTaxExempt(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <PageHeader
        onSignOut={handleSignOut}
        actions={
          <Button variant="outline" size="sm" onClick={() => setQbSettingsOpen(true)} className="gap-2">
            <Settings className="w-4 h-4" />
            QB Settings
          </Button>
        }
      />
      <QuickbooksSettingsDialog open={qbSettingsOpen} onOpenChange={setQbSettingsOpen} />

      <Dialog open={open} onOpenChange={dialogOnOpenChange}>
        <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCustomer ? "Edit Customer" : "Create New Customer"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={editingCustomer ? handleEditCustomer : handleCreateCustomer} className="space-y-4">
                <div>
                  <Label htmlFor="customerName">Display Name *</Label>
                  <Input
                    id="customerName"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="ABC Corporation"
                  />
                </div>
                <div>
                   <Label htmlFor="email">Email</Label>
                   <Input
                     id="email"
                     type="email"
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     placeholder="customer@example.com"
                   />
                 </div>
                 <div>
                   <Label htmlFor="shipToAddress">Shipping Address</Label>
                   <Input
                     id="shipToAddress"
                     value={shipToAddress}
                     onChange={(e) => setShipToAddress(e.target.value)}
                     placeholder="Enter default shipping address for blind ship orders"
                   />
                   <p className="text-xs text-slate-500 mt-1">Used as default for blind ship orders</p>
                 </div>
                 <div className="flex items-center gap-2">
                   <input
                     type="checkbox"
                     id="taxExempt"
                     checked={isTaxExempt}
                     onChange={(e) => setIsTaxExempt(e.target.checked)}
                     className="w-4 h-4 rounded"
                   />
                   <Label htmlFor="taxExempt" className="cursor-pointer">Tax Exempt</Label>
                 </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-red-600">QuickBooks Customer * (Required)</Label>
                    <Dialog open={createQBOpen} onOpenChange={setCreateQBOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" variant="outline" size="sm">
                          <Plus className="w-3 h-3 mr-1" />
                          Create New
                        </Button>
                      </DialogTrigger>
                      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
                        <DialogHeader>
                          <DialogTitle>Create QuickBooks Customer</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Display Name *</Label>
                            <Input
                              value={newQBCustomer.displayName}
                              onChange={(e) => setNewQBCustomer({...newQBCustomer, displayName: e.target.value})}
                              placeholder="ABC Corp"
                            />
                          </div>
                          <div>
                            <Label>Company Name</Label>
                            <Input
                              value={newQBCustomer.companyName}
                              onChange={(e) => setNewQBCustomer({...newQBCustomer, companyName: e.target.value})}
                              placeholder="ABC Corporation"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label>First Name</Label>
                              <Input
                                value={newQBCustomer.givenName}
                                onChange={(e) => setNewQBCustomer({...newQBCustomer, givenName: e.target.value})}
                                placeholder="John"
                              />
                            </div>
                            <div>
                              <Label>Last Name</Label>
                              <Input
                                value={newQBCustomer.familyName}
                                onChange={(e) => setNewQBCustomer({...newQBCustomer, familyName: e.target.value})}
                                placeholder="Doe"
                              />
                            </div>
                          </div>
                          <div>
                            <Label>Email</Label>
                            <Input
                              type="email"
                              value={newQBCustomer.email}
                              onChange={(e) => setNewQBCustomer({...newQBCustomer, email: e.target.value})}
                              placeholder="contact@example.com"
                            />
                          </div>
                          <div>
                            <Label>Phone</Label>
                            <Input
                              value={newQBCustomer.phone}
                              onChange={(e) => setNewQBCustomer({...newQBCustomer, phone: e.target.value})}
                              placeholder="+1 555-0123"
                            />
                          </div>
                          <Button onClick={handleCreateQBCustomer} className="w-full">Create Customer</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  {loadingQB ? (
                    <div className="flex items-center gap-2 p-2 text-sm text-slate-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading QuickBooks customers...
                    </div>
                  ) : qbError ? (
                    <div className="p-2 text-sm text-red-600 bg-red-50 rounded">
                      Failed to load customers. <button type="button" onClick={() => refetchQB()} className="underline font-semibold">Retry</button>
                    </div>
                  ) : (
                    <Popover open={qbOpen} onOpenChange={setQbOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={qbOpen}
                          className={`w-full justify-between ${!selectedQBCustomer ? 'text-muted-foreground' : ''}`}
                        >
                          {selectedQBCustomer
                            ? qbCustomers.find((c) => c.id === selectedQBCustomer)?.name
                            : "Search and select a customer..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput placeholder="Search customers..." />
                          <CommandList>
                            <CommandEmpty>No customer found.</CommandEmpty>
                            <CommandGroup>
                              {qbCustomers.map((qbCustomer) => (
                                <CommandItem
                                  key={qbCustomer.id}
                                  value={qbCustomer.name}
                                  onSelect={() => {
                                    setSelectedQBCustomer(qbCustomer.id);
                                    setQbOpen(false);
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${
                                      selectedQBCustomer === qbCustomer.id ? "opacity-100" : "opacity-0"
                                    }`}
                                  />
                                  {qbCustomer.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                  {!selectedQBCustomer && (
                    <p className="text-xs text-red-600 mt-1">Please select a QuickBooks customer to continue</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={loadingQB || !selectedQBCustomer}>
                  {editingCustomer ? "Update Customer" : "Create Customer"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <Button className="bg-[#EF4444] hover:bg-[#DC2626] text-white" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Customer
          </Button>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              placeholder="Search customers by name, company, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
           {filteredCustomers.map((customer) => (
             <Card key={customer.id} className="hover:shadow-lg transition-all duration-300 border-slate-200">
               <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                 <div className="flex-1">
                   <CardTitle className="text-base">{customer.customer_name}</CardTitle>
                   {customer.company_name && (
                     <p className="text-xs text-slate-600 mt-1">{customer.company_name}</p>
                   )}
                 </div>
                 <DropdownMenu>
                   <DropdownMenuTrigger asChild>
                     <Button variant="ghost" size="icon" className="h-8 w-8">
                       <MoreVertical className="w-4 h-4" />
                     </Button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent align="end">
                     <DropdownMenuItem onClick={() => openEditDialog(customer)}>
                       <Edit className="w-4 h-4 mr-2" />
                       Edit
                     </DropdownMenuItem>
                     <DropdownMenuItem onClick={() => setDeleteCustomer(customer)} className="text-red-600">
                       <Trash2 className="w-4 h-4 mr-2" />
                       Delete
                     </DropdownMenuItem>
                   </DropdownMenuContent>
                 </DropdownMenu>
               </CardHeader>
               <CardContent className="space-y-2">
                 {customer.email && (
                   <p className="text-xs text-slate-600">{customer.email}</p>
                 )}
                 <Link to={createPageUrl(`CustomerDetail?id=${customer.id}`)} className="block">
                   <Button variant="outline" className="w-full h-8 text-xs">
                     <ExternalLink className="w-3 h-3 mr-1" />
                     Manage Reorders
                   </Button>
                 </Link>
                 <div className="flex gap-1">
                   <Button
                     variant="secondary"
                     className="flex-1 h-8 text-xs"
                     onClick={() => copyLink(customer.unique_token)}
                   >
                     {copiedToken === customer.unique_token ? (
                       <>
                         <Check className="w-3 h-3 mr-1 text-green-600" />
                         Copied!
                       </>
                     ) : (
                       <>
                         <Copy className="w-3 h-3 mr-1" />
                         Copy Link
                       </>
                     )}
                   </Button>
                   <a
                     href={`${window.location.origin}${createPageUrl(`CustomerReorder?token=${customer.unique_token}`)}`}
                     target="_blank"
                     rel="noopener noreferrer"
                   >
                     <Button variant="secondary" size="icon" className="h-8 w-8">
                       <ExternalLink className="w-3 h-3" />
                     </Button>
                   </a>
                 </div>
               </CardContent>
             </Card>
           ))}
         </div>

        {customers.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-500 text-lg">No customers yet. Create your first customer to get started!</p>
          </div>
        )}

        {customers.length > 0 && filteredCustomers.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-500 text-lg">No customers match your search.</p>
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteCustomer} onOpenChange={() => setDeleteCustomer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteCustomer?.customer_name}? This action cannot be undone and will remove all associated reorders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCustomer} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}