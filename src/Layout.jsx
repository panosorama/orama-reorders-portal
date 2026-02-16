import { useEffect } from 'react';

const pageMetadata = {
  AdminDashboard: {
    title: 'Admin Dashboard | Orama Customer Portal',
    description: 'Manage customers, create orders, and track reorders in your Orama Business Solutions admin panel.'
  },
  CustomerReorder: {
    title: 'Reorder Products | Orama Business Solutions',
    description: 'Quickly reorder your favorite printing products - business cards, brochures, and more from Orama.'
  },
  CustomerDetail: {
    title: 'Customer Orders | Orama Business Solutions',
    description: 'View and manage customer orders, create invoices, and track project status.'
  },
  Home: {
    title: 'Orama Customer Reorder Portal | Business Cards & Printing Solutions',
    description: 'Orama Business Solutions Customer Reorder Portal - Easy reordering of business cards, brochures, and printing services.'
  }
};

export default function Layout({ children, currentPageName }) {
  useEffect(() => {
    const metadata = pageMetadata[currentPageName] || pageMetadata.Home;
    
    document.title = metadata.title;
    
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', metadata.description);
  }, [currentPageName]);

  return <>{children}</>;
}