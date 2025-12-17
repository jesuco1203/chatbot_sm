--
-- PostgreSQL database dump
--

\restrict WjcZsDVWGcZJrz6BjfnUPIIDV2mnJPQQ7xGlRhbo2e63PNdkL0Stz3gSQHDTMm9

-- Dumped from database version 15.15 (Debian 15.15-1.pgdg13+1)
-- Dumped by pg_dump version 15.15 (Debian 15.15-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: ingredients; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.ingredients (id, name, unit, cost, stock, min_stock, updated_at) VALUES ('caja_familiar', 'Caja Pizza Familiar', 'und', 2.00, 500.0000, 50.0000, '2025-11-28 17:39:05.974889+00');
INSERT INTO public.ingredients (id, name, unit, cost, stock, min_stock, updated_at) VALUES ('0043', 'oregano', 'kg', 0.00, 0.0000, 0.0000, '2025-11-29 00:48:15.563766+00');
INSERT INTO public.ingredients (id, name, unit, cost, stock, min_stock, updated_at) VALUES ('s342', 'weed', 'kg', 0.00, 0.0000, 0.0000, '2025-11-29 00:48:53.805537+00');
INSERT INTO public.ingredients (id, name, unit, cost, stock, min_stock, updated_at) VALUES ('harina', 'Harina Especial', 'kg', 4.50, 49.1000, 10.0000, '2025-12-14 00:16:07.451101+00');
INSERT INTO public.ingredients (id, name, unit, cost, stock, min_stock, updated_at) VALUES ('queso_moz', 'Queso Mozzarella', 'kg', 28.00, 19.7000, 5.0000, '2025-12-14 00:16:07.451101+00');
INSERT INTO public.ingredients (id, name, unit, cost, stock, min_stock, updated_at) VALUES ('salsa_tomate', 'Salsa de Tomate Casera', 'lt', 8.00, 29.8000, 5.0000, '2025-12-14 00:16:07.451101+00');
INSERT INTO public.ingredients (id, name, unit, cost, stock, min_stock, updated_at) VALUES ('jamon', 'Jamón Inglés', 'kg', 35.00, 9.8400, 2.0000, '2025-12-14 00:16:07.451101+00');
INSERT INTO public.ingredients (id, name, unit, cost, stock, min_stock, updated_at) VALUES ('pina', 'Piña Golden', 'kg', 6.00, 14.8000, 3.0000, '2025-12-14 00:16:07.451101+00');
INSERT INTO public.ingredients (id, name, unit, cost, stock, min_stock, updated_at) VALUES ('caja_grande', 'Caja Pizza Grande', 'und', 1.50, 498.0000, 50.0000, '2025-12-14 00:16:07.451101+00');


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('jamon', 'Pizza de Jamón', 'Jamón ahumado y mozzarella sobre salsa de tomate.', 'pizza', '{"Grande": 24, "Familiar": 32}', NULL, true, '{clasica,jamon,niños}', '2025-11-27 21:04:42.322495+00', '2025-11-27 21:04:42.322495+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('americana', 'Pizza Americana', 'Jamón, queso mozzarella, aceitunas negras y pimentón.', 'pizza', '{"Grande": 25, "Familiar": 33}', NULL, true, '{clasica,usa,popular}', '2025-11-27 21:04:42.322495+00', '2025-11-27 21:04:42.322495+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('hawaiana', 'Pizza Hawaiana', 'Queso mozzarella, jamón y trozos de piña golden.', 'pizza', '{"Grande": 26, "Familiar": 34}', NULL, true, '{piña,dulce,tropical}', '2025-11-27 21:04:42.322495+00', '2025-11-27 21:04:42.322495+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('pepperoni', 'Pizza de Pepperoni', 'Láminas de pepperoni, mozzarella y salsa de tomate clásica.', 'pizza', '{"Grande": 26, "Familiar": 34}', NULL, true, '{peperoni,salami,picantito}', '2025-11-27 21:04:42.322495+00', '2025-11-27 21:04:42.322495+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('salame', 'Pizza de Salame', 'Salame italiano, mozzarella y toque de hierbas finas.', 'pizza', '{"Grande": 27, "Familiar": 35}', NULL, true, '{salame,italiana}', '2025-11-27 21:04:42.322495+00', '2025-11-27 21:04:42.322495+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('pollo_hawaiano', 'Pizza de Pollo Hawaiano', 'Pollo sazonado, jamón y piña golden en almíbar.', 'pizza', '{"Grande": 28, "Familiar": 36}', NULL, true, '{pollo,piña}', '2025-11-27 21:04:42.322495+00', '2025-11-27 21:04:42.322495+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('pollo_hawaiano_bbq', 'Pizza de Pollo Hawaiano BBQ', 'Pollo aderezado, jamón, cabanozzi, piña y salsa BBQ.', 'pizza', '{"Grande": 31, "Familiar": 39}', NULL, true, '{barbacoa,bbq,dulce}', '2025-11-27 21:04:42.322495+00', '2025-11-27 21:04:42.322495+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('la_diabla', 'Pizza La Diabla', 'Salsa picante, jamón, cabanozzi, pimentón y durazno.', 'pizza', '{"Grande": 31, "Familiar": 39}', NULL, true, '{picante,hot,ají}', '2025-11-27 21:04:42.322495+00', '2025-11-27 21:04:42.322495+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('meats_hawaian_bbq', 'Pizza Meats Hawaian BBQ', 'Pollo y lomo fino aderezado, chorizo, jamón y salsa BBQ.', 'pizza', '{"Grande": 37, "Familiar": 45}', NULL, true, '{carnivora,bbq}', '2025-11-27 21:04:42.322495+00', '2025-11-27 21:04:42.322495+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('meat_lovers', 'Pizza Meat Lovers (Carnívora)', 'Lomo fino, pollo, chorizo, cabanozzi, tocino y jamón.', 'pizza', '{"Grande": 36, "Familiar": 44}', NULL, true, '{carne,carnivora,proteina}', '2025-11-27 21:04:42.322495+00', '2025-11-27 21:04:42.322495+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('lasagna_bolognesa', 'Lasagna Bolognesa', 'Salsa boloñesa con carne de res y salsa bechamel.', 'lasagna', '{"Personal": 21}', NULL, true, '{carne,pasta}', '2025-11-27 21:04:42.322495+00', '2025-11-27 21:04:42.322495+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('lasagna_alfredo', 'Lasagna Alfredo', 'Salsa bechamel, jamón y queso mozzarella.', 'lasagna', '{"Personal": 21}', NULL, true, '{blanca,jamon}', '2025-11-27 21:04:42.322495+00', '2025-11-27 21:04:42.322495+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('Agua', 'Agua San luis', 'agua embotellada', 'drink', '{"personal": 2}', NULL, false, '{agua,bebida}', '2025-11-28 06:39:52.293524+00', '2025-12-05 00:10:57.651564+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('jora', 'Chicha de jora', 'Chicha fresca de jora ', 'drink', '{"Vaso grande ": 8, "Vaso mediano": 5}', NULL, false, '{chicha,bebida}', '2025-12-04 21:26:17.658012+00', '2025-12-05 00:11:13.244631+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('Chicha', 'Chicha morada', 'Chicha de maiz y especias', 'drink', '{"Vaso grande": 8, "Vaso mediano": 5}', NULL, false, '{chicha,bebida,maiz}', '2025-11-28 06:35:58.937677+00', '2025-12-05 00:11:17.157962+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('tocosh', 'Pizza Tocosh', 'tocosh, queso de cabra, cushuro y salsa especial', 'pizza', '{"Familiar": 46, "personal": 15}', NULL, true, '{tocosh,cushuro,huancaina}', '2025-12-01 03:41:28.941321+00', '2025-12-01 03:42:12.184939+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('tropical', 'Pizza Tropical', 'Jamón, piña y durazno sobre queso mozzarella.', 'pizza', '{"Grande": 28, "Familiar": 36}', NULL, false, '{dulce,fruta,durazno}', '2025-11-27 21:04:42.322495+00', '2025-12-05 05:02:05.958317+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('gaseosa_pepsi', 'Gaseosa Pepsi', 'Bebida gasificada refrescante.', 'drink', '{"2Lt": 8, "1.5Lt": 5, "500ml": 2.5}', NULL, true, '{soda,refresco,cola}', '2025-11-27 21:04:42.322495+00', '2025-11-29 00:49:16.887608+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('vergona', 'Pizza Vergona', 'Chorizo, verga picada, leche, queso de cabra', 'pizza', '{"Grande": 35, "Familiar": 45}', NULL, true, '{pingona}', '2025-11-28 05:38:36.767784+00', '2025-12-05 04:43:33.606433+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('super_suprema', 'Pizza Super Suprema', 'Pepperoni, lomo, pollo, jamón, champiñón y aceitunas.', 'pizza', '{"Grande": 37, "Familiar": 45}', NULL, false, '{suprema,todo}', '2025-11-27 21:04:42.322495+00', '2025-12-05 05:02:35.923135+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('vegetariana', 'Pizza Vegetariana', 'Pimentones, cebolla roja, champiñones, aceitunas y tomate.', 'pizza', '{"Familiar": 33, "personal": 9}', NULL, true, '{veggie,verduras,"sin carne"}', '2025-11-27 21:04:42.322495+00', '2025-12-05 05:43:17.460581+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('suprema', 'Pizza Suprema', 'Lomo fino, pollo, jamón, cabanozzi, cebolla y pimentones.', 'pizza', '{"Grande": 32, "Familiar": 40}', NULL, true, '{lomo,carne,full}', '2025-11-27 21:04:42.322495+00', '2025-12-05 04:45:33.359712+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('mondongo', 'pizza mondongo', 'rico mondogo', 'pizza', '{"Familiar": 45}', NULL, true, '{mondongo}', '2025-11-30 17:44:13.005528+00', '2025-12-05 06:06:23.236512+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('charqui', 'Pizza de charqui', 'pizza con charqui de res', 'pizza', '{"Grande": 36, "Familiar": 47, "Personal": 27}', NULL, true, '{charqui,res,seca,carne}', '2025-11-30 18:28:00.719533+00', '2025-12-01 02:40:16.708272+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('Chorizo', 'Pizza de Chorizo y Champiñón', 'Rodajas de chorizo, champiñones frescos y queso mozzarella.', 'pizza', '{"Grande": 30, "Familiar": 38}', NULL, true, '{chorizo,champiñones}', '2025-12-07 03:09:42.246324+00', '2025-12-07 03:09:42.246324+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('dechorizo', 'Pizza Dechorizo y Champiñón', 'Rodajas de chorizo, champiñones frescos y queso mozzarella.', 'pizza', '{"Grande": 30, "Familiar": 38}', NULL, false, '{chorizo,champiñones}', '2025-11-27 21:04:42.322495+00', '2025-12-07 04:52:38.935432+00');
INSERT INTO public.products (id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at) VALUES ('aji de gallina', 'pizza Aji de gallinita', 'con salsa de aji de gallina, aceituna, huevo duro, queso ', 'pizza', '{"familiar": 47, "personal": 15}', NULL, true, '{salado,aji,peruana}', '2025-12-05 06:09:10.497966+00', '2025-12-07 04:53:46.734603+00');


--
-- Data for Name: product_ingredients; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.product_ingredients (id, product_id, ingredient_id, quantity) VALUES ('497a3346-0946-49e0-a7f4-3040927dcda2', 'hawaiana', 'harina', 0.3000);
INSERT INTO public.product_ingredients (id, product_id, ingredient_id, quantity) VALUES ('a22e8872-5e53-4cde-9160-cc355375e392', 'hawaiana', 'queso_moz', 0.1500);
INSERT INTO public.product_ingredients (id, product_id, ingredient_id, quantity) VALUES ('9495bba0-8b70-4b0d-814d-7edf6d79e8a2', 'hawaiana', 'salsa_tomate', 0.1000);
INSERT INTO public.product_ingredients (id, product_id, ingredient_id, quantity) VALUES ('0ac96cd5-7a00-4ae8-80de-5aef6810eb8a', 'hawaiana', 'jamon', 0.0800);
INSERT INTO public.product_ingredients (id, product_id, ingredient_id, quantity) VALUES ('a8e6cee3-ece1-4849-a0ba-f163c9d1009d', 'hawaiana', 'pina', 0.1000);
INSERT INTO public.product_ingredients (id, product_id, ingredient_id, quantity) VALUES ('53d48330-5e0b-49fb-b301-bb31aab612a6', 'hawaiana', 'caja_grande', 1.0000);
INSERT INTO public.product_ingredients (id, product_id, ingredient_id, quantity) VALUES ('c23df8fb-ad7e-4f28-80dc-75038982c59b', 'lasagna_alfredo', 'harina', 0.3000);


--
-- PostgreSQL database dump complete
--

\unrestrict WjcZsDVWGcZJrz6BjfnUPIIDV2mnJPQQ7xGlRhbo2e63PNdkL0Stz3gSQHDTMm9

