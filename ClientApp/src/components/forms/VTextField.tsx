

interface VTextFieldProps {
  label: string;
  placeholder?: string;
  type?: string;
  name: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
}

export const VTextField = ({
  label,
  placeholder,
  type = 'text',
  name,
  id,
  required = false,
  disabled = false
}: VTextFieldProps) => {
  return (
    <div className="space-y-2">
      <label 
        htmlFor={id || name} 
        className={`block text-sm font-medium text-gray-700 dark:text-gray-300 ${required ? 'after:content-["*"] after:ml-0.5 after:text-red-500' : ''}`}
      >
        {label}
      </label>
      <input
        id={id || name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={`
          block w-full rounded-md border-gray-300 shadow-sm
          focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm
          dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300
          dark:focus:border-indigo-400 dark:focus:ring-indigo-300
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      />
    </div>
  );
};