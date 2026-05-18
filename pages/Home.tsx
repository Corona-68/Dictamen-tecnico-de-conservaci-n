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
          Herramienta para elaborar DT de conservación
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Basada en la metodología AASHTO-1993
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        <Card
          to="/datos"
          title="Datos Generales"
          description="Ingresa los parámetros del proyecto: Información del camino, tránsito, factores de diseño, diagnóstico y de la estructuración de capas del pavimento."
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
          description="Visualiza la tabla de resultados con los ejes acumulados en el 1er. año (sencillos, tándem y trídem) tanto cargados como vacíos."
          icon="fa-chart-bar"
          color="bg-emerald-500"
        />
        <Card
          to="/esals"
          title="Diseño de Pavimento"
          description="Se calcula la vida remanente del pavimento actual y de las 3 alternativas que se propongan."
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
            Mediante el número estructural "SN" de la estructura actual bajo sus condiciones prevalecientes de deterioro o daño se determina su vida remanente estimada, posterior a ello se proponen alternativas para incrementar la vida a por lo menos 10 años.
          </p>
          <p>
            La herramienta permite iterar el SN en la fórmula de la AASHTO-1993 con el utilizado en el cálculo de los ESAL's, sin embargo, para incorporar la variable tránsito al análisis, es necesario convertir el flujo mixto de vehículos a ejes (sencillos, tándem y trídem) y estos a su vez en ejes equivalentes de 8.2 toneladas.
          </p>
          <p>
            Esta aplicación automatiza el cálculo basado en las cargas máximas permitidas de la NOM-012-SCT-2-2017 para caminos tipo ET, A, B, C y D, facilitando el cálculo final de <strong>ESALs (Equivalent Single Axle Load)</strong>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Home;