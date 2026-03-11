import React from 'react';
import { Link } from 'react-router-dom';

const Card: React.FC<{
  to: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}> = ({ to, title, description, icon, color }) => (
  <Link
    to={to}
    className="block bg-white border border-slate-200 rounded-xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200 hover:border-blue-200 group h-full"
  >
    <div className={`w-14 h-14 rounded-lg flex items-center justify-center mb-4 text-2xl text-white ${color}`}>
      <i className={`fas ${icon}`}></i>
    </div>
    <h2 className="text-xl font-bold text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">{title}</h2>
    <p className="text-slate-500 leading-relaxed text-sm">{description}</p>
  </Link>
);

const Home: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
          Herramienta para diseño de pavimentos
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Basada en la metodología AASHTO-1993
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        <Card
          to="/datos"
          title="Datos Generales"
          description="Configura los parámetros del proyecto: TDPA, porcentaje de carga, tipo de camino y número de carriles."
          icon="fa-file-invoice"
          color="bg-orange-500"
        />
        <Card
          to="/composicion"
          title="Composición Vehicular"
          description="Define la distribución porcentual de los 29 tipos de vehículos clasificados en la normativa."
          icon="fa-calculator"
          color="bg-blue-600"
        />
        <Card
          to="/ejes"
          title="Ejes 1er. Año"
          description="Visualiza la tabla de resultados con los ejes acumulados (sencillos, tándem y trídem) por estado de carga."
          icon="fa-chart-bar"
          color="bg-emerald-500"
        />
        <Card
          to="/esals"
          title="Diseño de Pavimento"
          description="Cálculo de ESALs de diseño y determinación de la estructura de pavimento requerida (espesores)."
          icon="fa-layer-group"
          color="bg-purple-600"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-4xl mx-auto shadow-sm">
        <h3 className="text-2xl font-bold text-slate-900 mb-4 border-b border-slate-100 pb-4">
          Acerca de la metodología
        </h3>
        <div className="space-y-4 text-slate-700">
          <p>
            Para incorporar la variable tránsito al análisis y diseño de pavimentos, es necesario convertir el flujo mixto de vehículos en cargas estandarizadas por eje. Estos se clasifican en:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-slate-600">
            <li><strong className="text-emerald-600">Ejes sencillos:</strong> Un solo eje con ruedas simples o dobles.</li>
            <li><strong className="text-blue-600">Ejes tándem:</strong> Dos ejes articulados.</li>
            <li><strong className="text-purple-600">Ejes trídem:</strong> Tres ejes articulados.</li>
          </ul>
          <p>
            Esta aplicación automatiza el cálculo basado en las cargas máximas permitidas para caminos tipo ET, A, B, C y D, facilitando el cálculo final de <strong>ESALs (Equivalent Single Axle Load)</strong>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Home;