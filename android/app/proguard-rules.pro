-keepattributes *Annotation*,JavascriptInterface,Signature,InnerClasses,EnclosingMethod
-keep public class com.metahara.homedesk.MainActivity
-keepclasseswithmembers class com.metahara.homedesk.MainActivity$NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep public class com.metahara.homedesk.R$* { *; }
-keep public class com.getcapacitor.BridgeActivity { *; }
-keep public class com.getcapacitor.Bridge { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.Permission <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep public class * extends org.apache.cordova.* {
    public <methods>;
    public <fields>;
}
