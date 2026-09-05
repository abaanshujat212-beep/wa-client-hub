<?php
/**
 * Plugin Name: WA Client Hub Connector
 * Description: Sends signed WooCommerce customer and order webhooks to WA Client Hub.
 * Version: 0.1.0
 */
if (!defined('ABSPATH')) exit;
function wach_keep_secret($value){return $value===''?get_option('wach_secret'):sanitize_text_field($value);}
function wach_register_settings(){register_setting('wach','wach_endpoint',['sanitize_callback'=>'esc_url_raw']);register_setting('wach','wach_secret',['sanitize_callback'=>'wach_keep_secret']);}
add_action('admin_init','wach_register_settings');
function wach_menu(){add_options_page('WA Client Hub','WA Client Hub','manage_options','wach','wach_page');}
add_action('admin_menu','wach_menu');
function wach_page(){if(!current_user_can('manage_options'))return;$last=get_option('wach_last_delivery');?><div class="wrap"><h1>WA Client Hub</h1><form method="post" action="options.php"><?php settings_fields('wach'); ?><table class="form-table"><tr><th>Webhook endpoint</th><td><input class="regular-text" name="wach_endpoint" value="<?php echo esc_attr(get_option('wach_endpoint')); ?>"></td></tr><tr><th>Webhook secret</th><td><input class="regular-text" type="password" name="wach_secret" value="" placeholder="Leave blank to keep current secret"></td></tr></table><?php submit_button('Connect / update'); ?></form><p>The stored secret is never rendered back into this page.</p><?php if(is_array($last)): ?><h2>Last delivery</h2><p><?php echo esc_html($last['topic'].' — HTTP '.$last['status'].' — '.$last['at']); ?></p><?php endif; ?></div><?php }
function wach_send($resource,$action,$payload){$url=get_option('wach_endpoint');$secret=get_option('wach_secret');if(!$url||!$secret)return;$body=wp_json_encode($payload);$topic=$resource.'.'.$action;$response=wp_remote_post($url,['timeout'=>5,'headers'=>['Content-Type'=>'application/json','X-WC-Webhook-Topic'=>$topic,'X-WC-Webhook-Delivery-ID'=>wp_generate_uuid4(),'X-WC-Webhook-Signature'=>base64_encode(hash_hmac('sha256',$body,$secret,true))],'body'=>$body]);$status=is_wp_error($response)?'error':wp_remote_retrieve_response_code($response);update_option('wach_last_delivery',['topic'=>$topic,'status'=>(string)$status,'at'=>current_time('mysql')],false);}
add_action('woocommerce_new_order',function($id){$order=wc_get_order($id);if($order)wach_send('order','created',$order->get_data());});
add_action('woocommerce_update_order',function($id){$order=wc_get_order($id);if($order)wach_send('order','updated',$order->get_data());});
add_action('woocommerce_created_customer',function($id){$customer=new WC_Customer($id);wach_send('customer','created',$customer->get_data());});
add_action('profile_update',function($id){if(class_exists('WC_Customer')&&wc_customer_bought_product('',(int)$id,0)!==null){$customer=new WC_Customer($id);wach_send('customer','updated',$customer->get_data());}},10,1);
