import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';

function ProtectedRoute({role, children}){
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchUser() {
            const result = await api('/api/auth/me');
            if(result.ok){
                setUser(result.data);
            }
            setLoading(false);
        }
        fetchUser();
    }, []);

    if(loading){
        return <div>Loading...</div>;
    }

    if(!user || user.role !== role){
        return <Navigate to="/" />;
    }

    return children;
}

export default ProtectedRoute;