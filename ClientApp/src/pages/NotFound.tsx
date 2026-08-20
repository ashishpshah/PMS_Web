import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-9xl font-black text-gray-200 dark:text-gray-800">404</h1>
        <p className="text-2xl font-bold text-gray-700 dark:text-gray-300 mt-4">
          Page Not Found
        </p>
        <p className="text-gray-500 dark:text-gray-500 mt-2">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-6 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Go Home
        </button>
      </div>
    </div>
  );
}