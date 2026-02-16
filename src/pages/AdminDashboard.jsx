import React, { useState } from "react";
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
import { Plus, ExternalLink, Copy, Loader2, Check, ChevronsUpDown, Trash2, Edit, Search } from "lucide-react";
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

  const { data: customers = [], refetch } = useQuery({
    queryKey: ['customers'],
    queryFn: () => base44.entities.Customer.list('-created_date')
  });

  const { data: qbCustomers = [], isLoading: loadingQB, refetch: refetchQB } = useQuery({
    queryKey: ['qbCustomers'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getQuickbooksCustomers', {});
      return response.data.customers || [];
    }
  });

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
        quickbooks_customer_name: qbCustomer?.name
      });

      toast.success("Customer created successfully!");
      setOpen(false);
      setCustomerName("");
      setCompanyName("");
      setEmail("");
      setSelectedQBCustomer("");
      refetch();
    } catch (error) {
      toast.error("Failed to create customer: " + error.message);
    }
  };

  const copyLink = (token) => {
    const url = `${window.location.origin}${createPageUrl(`CustomerReorder?token=${token}`)}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard!");
  };

  const handleCreateQBCustomer = async (e) => {
    e.preventDefault();
    
    try {
      const response = await base44.functions.invoke('createQuickbooksCustomer', newQBCustomer);
      
      if (response.data.success) {
        toast.success("QuickBooks customer created!");
        setCreateQBOpen(false);
        setNewQBCustomer({
          displayName: "",
          companyName: "",
          givenName: "",
          familyName: "",
          email: "",
          phone: ""
        });
        await refetchQB();
        setSelectedQBCustomer(response.data.customer.id);
      } else {
        toast.error(response.data.error || "Failed to create customer");
      }
    } catch (error) {
      toast.error("Failed to create QuickBooks customer");
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
        quickbooks_customer_name: qbCustomer?.name
      });

      toast.success("Customer updated successfully!");
      setEditingCustomer(null);
      setOpen(false);
      setCustomerName("");
      setCompanyName("");
      setEmail("");
      setSelectedQBCustomer("");
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
    setOpen(true);
  };

  const filteredCustomers = customers.filter(customer => 
    customer.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">Orama Solutions</h1>
            <p className="text-slate-600 mt-2">Customer Reorder Portal</p>
          </div>
          <Dialog open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen);
            if (!isOpen) {
              setEditingCustomer(null);
              setCustomerName("");
              setCompanyName("");
              setEmail("");
              setSelectedQBCustomer("");
            }
          }}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                New Customer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCustomer ? "Edit Customer" : "Create New Customer"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={editingCustomer ? handleEditCustomer : handleCreateCustomer} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>QuickBooks Customer *</Label>
                    <Dialog open={createQBOpen} onOpenChange={setCreateQBOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" variant="outline" size="sm">
                          <Plus className="w-3 h-3 mr-1" />
                          Create New
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create QuickBooks Customer</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCreateQBCustomer} className="space-y-4">
                          <div>
                            <Label>Display Name *</Label>
                            <Input
                              value={newQBCustomer.displayName}
                              onChange={(e) => setNewQBCustomer({...newQBCustomer, displayName: e.target.value})}
                              required
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
                          <Button type="submit" className="w-full">Create Customer</Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                  {loadingQB ? (
                    <div className="flex items-center gap-2 p-2 text-sm text-slate-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading QuickBooks customers...
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
                </div>
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
                <Button type="submit" className="w-full" disabled={loadingQB}>
                  {editingCustomer ? "Update Customer" : "Create Customer"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCustomers.map((customer) => (
            <Card key={customer.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-xl">{customer.customer_name}</CardTitle>
                {customer.company_name && (
                  <p className="text-sm text-slate-600">{customer.company_name}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {customer.email && (
                  <p className="text-sm text-slate-600">{customer.email}</p>
                )}
                <div className="flex gap-2">
                  <Link to={createPageUrl(`CustomerDetail?id=${customer.id}`)} className="flex-1">
                    <Button variant="outline" className="w-full">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Manage Orders
                    </Button>
                  </Link>
                </div>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => copyLink(customer.unique_token)}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Customer Link
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => openEditDialog(customer)}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDeleteCustomer(customer)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
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
              Are you sure you want to delete {deleteCustomer?.customer_name}? This action cannot be undone and will remove all associated orders.
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