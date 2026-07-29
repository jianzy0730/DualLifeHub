"use strict";

var pageModule = require("./ui/pig_pet.ui.js");
var page = pageModule.default || pageModule;

var ROUTE = "toolpkg:com.community.dual_pig_pet:ui:pet";

function registerToolPkg() {
  ToolPkg.registerUiRoute({
    id: "dual_pig_pet",
    route: ROUTE,
    runtime: "compose_dsl",
    screen: page,
    params: {},
    title: { zh: "双生猪猪", en: "DualPig Companion" },
    keepAlive: true
  });
  ToolPkg.registerNavigationEntry({
    id: "dual_pig_pet_sidebar",
    route: ROUTE,
    surface: "main_sidebar_plugins",
    title: { zh: "双生猪猪", en: "DualPig" },
    icon: Icons.SportsEsports,
    order: 115
  });
  ToolPkg.registerToolboxUiModule({
    id: "dual_pig_pet_toolbox",
    runtime: "compose_dsl",
    screen: page,
    params: {},
    title: { zh: "双生猪猪", en: "DualPig Companion" },
    keepAlive: true
  });
  return true;
}

exports.registerToolPkg = registerToolPkg;
