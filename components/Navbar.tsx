import React from 'react';
import { NavLink } from 'react-router-dom';
import { useFirebase } from './FirebaseProvider';

const Navbar: React.FC = () => {
  const { user, login, logout, loading } = useFirebase();

  // Optimizamos las clases para móvil: texto más pequeño, iconos prominentes, menos padding
  const getLinkClass = ({ isActive }: { isActive: boolean }) => 
    `flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 md:px-4 py-2 rounded-md transition-colors duration-200 text-xs md:text-base flex-1 md:flex-none ${
      isActive 
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' 
        : 'text-slate-600 hover:bg-slate-100 hover:text-blue-600'
    }`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm no-print">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Título (Oculto en móviles muy pequeños para dar espacio al menú) */}
          <div className="hidden lg:flex items-center font-bold text-slate-800 mr-4">
            <i className="fas fa-truck-moving text-blue-600 mr-2"></i>
            <span>Ingeniería en Vías Terrestres</span>
          </div>

          {/* Menú de navegación con scroll horizontal en móvil */}
          <div className="flex items-center overflow-x-auto no-scrollbar w-full md:w-auto gap-1 md:gap-2 py-2 md:py-0">
            <div className="flex items-center gap-1 md:gap-2 min-w-max md:min-w-0">
              <NavLink to="/" className={getLinkClass}>
                <i className="fas fa-home text-sm md:text-lg"></i> 
                <span>Inicio</span>
              </NavLink>
              <NavLink to="/datos" className={getLinkClass}>
                <i className="fas fa-file-invoice text-sm md:text-lg"></i> 
                <span className="whitespace-nowrap">Datos</span>
              </NavLink>
              <NavLink to="/composicion" className={getLinkClass}>
                <i className="fas fa-calculator text-sm md:text-lg"></i> 
                <span className="whitespace-nowrap">Comp. Ejes</span>
              </NavLink>
              <NavLink to="/esals" className={getLinkClass}>
                <i className="fas fa-layer-group text-sm md:text-lg"></i> 
                <span>Estructuración</span>
              </NavLink>
              <NavLink to="/calculo-esals" className={getLinkClass}>
                <i className="fas fa-truck-moving text-sm md:text-lg"></i> 
                <span>ESAL's</span>
              </NavLink>
              <NavLink to="/unam" className={getLinkClass}>
                <i className="fas fa-university text-sm md:text-lg"></i> 
                <span>UNAM</span>
              </NavLink>
              
              {/* Botón de Imprimir */}
              <button 
                onClick={handlePrint}
                className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 md:px-4 py-2 rounded-md transition-colors duration-200 text-xs md:text-base text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 whitespace-nowrap"
                title="Imprimir pantalla"
              >
                <i className="fas fa-print text-sm md:text-lg"></i>
                <span className="hidden sm:inline">Imprimir</span>
              </button>

              {/* Auth Section */}
              {!loading && (
                user ? (
                  <div className="flex items-center gap-2 ml-2">
                    <img 
                      src={user.photoURL || ''} 
                      alt={user.displayName || ''} 
                      className="w-8 h-8 rounded-full border border-slate-200 hidden md:block"
                      referrerPolicy="no-referrer"
                    />
                    <button 
                      onClick={logout}
                      className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 md:px-4 py-2 rounded-md transition-colors duration-200 text-xs md:text-base text-red-600 hover:bg-red-50 hover:text-red-700 whitespace-nowrap"
                    >
                      <i className="fas fa-sign-out-alt text-sm md:text-lg"></i>
                      <span className="hidden sm:inline">Salir</span>
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={login}
                    className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 md:px-4 py-2 rounded-md transition-colors duration-200 text-xs md:text-base text-blue-600 hover:bg-blue-50 hover:text-blue-700 whitespace-nowrap ml-2"
                  >
                    <i className="fas fa-user-circle text-sm md:text-lg"></i>
                    <span className="hidden sm:inline">Entrar</span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
