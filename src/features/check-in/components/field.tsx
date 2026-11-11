import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  id?: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Field({ id, label, required, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
