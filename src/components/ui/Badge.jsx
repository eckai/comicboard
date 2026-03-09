const variants = {
  default: 'bg-primary/10 text-primary',
  pending: 'bg-pending/10 text-pending',
  approved: 'bg-approved/10 text-approved',
  paid: 'bg-paid/10 text-paid',
  archived: 'bg-archived/10 text-archived',
  destructive: 'bg-destructive/10 text-destructive',
}

export default function Badge({ children, variant = 'default', className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}
